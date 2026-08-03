import { Controller, Post, Body, Res, MessageEvent } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  async streamChat(
    @Body() dto: ChatRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = this.chatService.createStream(dto.sessionId, dto.question);

      stream.subscribe({
        next: (event) => {
          if (event.type === 'token') {
            sendEvent('token', { type: 'token', token: event.token });
          } else if (event.type === 'done') {
            sendEvent('done', {
              type: 'done',
              fullResponse: event.fullResponse,
              sources: event.sources,
            });
          } else if (event.type === 'error') {
            sendEvent('error', { type: 'error', error: event.error });
          }
        },
        error: (err) => {
          sendEvent('error', { error: err.message || 'Unknown error' });
          res.end();
        },
        complete: () => {
          res.end();
        },
      });
    } catch (err) {
      sendEvent('error', { error: err.message || 'Unknown error' });
      res.end();
    }
  }
}
