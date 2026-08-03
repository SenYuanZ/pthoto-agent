import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, Subscriber } from 'rxjs';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { JsonStore } from '../common/json-store';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';

interface StreamToken {
  type: 'token' | 'done' | 'error';
  token?: string;
  fullResponse?: string;
  sources?: SourceRef[];
  error?: string;
}

interface SourceRef {
  source: string;
  category?: string;
  chunkId?: string;
  text: string;
}

interface ChatHistoryFile {
  [sessionId: string]: Array<{ role: 'human' | 'ai'; content: string }>;
}

class InMemoryChatHistory extends BaseListChatMessageHistory {
  private messages: BaseMessage[];

  constructor(
    private sessionId: string,
    initial: BaseMessage[] = [],
  ) {
    super();
    this.messages = initial;
  }

  get lc_namespace(): string[] {
    return ['in-memory-chat-history'];
  }

  async getMessages(): Promise<BaseMessage[]> {
    return this.messages;
  }

  async addMessage(message: BaseMessage): Promise<void> {
    this.messages.push(message);
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private model: ChatOpenAI;
  private memoryStore: Map<string, InMemoryChatHistory> = new Map();

  constructor(
    private configService: ConfigService,
    private knowledgeService: KnowledgeService,
    private jsonStore: JsonStore,
  ) {
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('longcat.apiKey'),
      configuration: {
        baseURL: this.configService.get<string>('longcat.baseUrl'),
      },
      model: this.configService.get<string>('longcat.model'),
      streaming: true,
      temperature: this.configService.get<number>('rag.temperature'),
    });
  }

  createStream(sessionId: string, question: string): Observable<StreamToken> {
    return new Observable<StreamToken>((subscriber) => {
      this.processChat(sessionId, question, subscriber).catch((err) => {
        this.logger.error(`Chat stream error: ${err.message}`, err.stack);
        subscriber.next({
          type: 'error',
          error: err.message || 'Unknown error occurred',
        });
        subscriber.complete();
      });
    });
  }

  private async getHistory(sessionId: string): Promise<InMemoryChatHistory> {
    if (!this.memoryStore.has(sessionId)) {
      const file = await this.jsonStore.read<ChatHistoryFile>('chat-history', {});
      const initial = (file[sessionId] || []).map((rec) =>
        rec.role === 'human'
          ? new HumanMessage(rec.content)
          : new AIMessage(rec.content),
      );
      this.memoryStore.set(sessionId, new InMemoryChatHistory(sessionId, initial));
    }
    return this.memoryStore.get(sessionId)!;
  }

  private async persistHistory(sessionId: string): Promise<void> {
    const history = this.memoryStore.get(sessionId);
    if (!history) return;
    const messages = await history.getMessages();
    const file = await this.jsonStore.read<ChatHistoryFile>('chat-history', {});
    file[sessionId] = messages.map((m) => ({
      role: m instanceof HumanMessage ? 'human' : 'ai',
      content: String(m.content),
    }));
    await this.jsonStore.write('chat-history', file);
  }

  private async processChat(
    sessionId: string,
    question: string,
    subscriber: Subscriber<StreamToken>,
  ) {
    const vectorStore = this.knowledgeService.getVectorStore();
    const topK = this.configService.get<number>('rag.topK');
    const history = await this.getHistory(sessionId);

    // Retrieve relevant documents
    const docs = await vectorStore.similaritySearch(question, topK);
    const context = docs.map((doc) => doc.pageContent).join('\n\n');

    // Build messages with history and context
    const historyMessages = await history.getMessages();

    const systemMessage = `你是一位专业的摄影知识助手，精通摄影理论、器材使用、后期处理和各类拍摄场景。

请根据提供的参考资料回答用户的摄影问题。回答要求：
1. 使用中文回答
2. 回答要专业、准确、易懂
3. 适当使用摄影术语，但要对专业术语做简要解释
4. 可以给出具体的参数建议和实操技巧
5. 如果参考资料不足以回答问题，请如实说明

参考资料：
${context}`;

    const messages: BaseMessage[] = [
      new HumanMessage(`System: ${systemMessage}`),
      ...historyMessages,
      new HumanMessage(question),
    ];

    let fullResponse = '';

    const stream = await this.model.stream(messages);

    for await (const chunk of stream) {
      if (chunk.content && typeof chunk.content === 'string') {
        fullResponse += chunk.content;
        subscriber.next({ type: 'token', token: chunk.content });
      }
    }

    // Save to history
    await history.addMessage(new HumanMessage(question));
    await history.addMessage(new AIMessage(fullResponse));
    await this.persistHistory(sessionId);

    // Collect sources (dedupe by chunkId, keep snippet text for jump-back)
    const seen = new Set<string>();
    const sources: SourceRef[] = [];
    for (const doc of docs) {
      const source = doc.metadata?.source as string;
      if (!source) continue;
      const key = (doc.metadata?.chunkId as string) || source;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        source,
        category: doc.metadata?.category as string,
        chunkId: doc.metadata?.chunkId as string,
        text: doc.pageContent,
      });
    }

    subscriber.next({
      type: 'done',
      fullResponse,
      sources,
    });

    subscriber.complete();
  }
}
