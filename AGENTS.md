# AGENTS.md

摄影知识问答系统 (Photography knowledge Q&A). NestJS 10 + LangChain.js 1.x + LongCat 2.0 (OpenAI-compatible API) with an in-memory RAG knowledge base and vanilla JS chat UI.

## Commands
- `npm run start:dev` — dev server with watch, serves UI at `http://localhost:3001`
- `npm run build` — `nest build` (outputs to `dist/`, `deleteOutDir: true`)
- `npm run start:prod` — `node dist/main.js`
- No tests, no linter, no formatter configured. Verify by building + running.

## Setup
- Copy `.env.example` to `.env`; `DEEPSEEK_API_KEY` is required for chat to work.
- DeepSeek requests use the OpenAI-compatible endpoint `https://api.deepseek.com`; override with `DEEPSEEK_BASE_URL` only when needed.
- The app boots and serves the UI even without an API key; only streaming chat fails.

## Key gotchas
- Embeddings are a **pure-JS hash vectorizer** (`src/knowledge/local-embeddings.ts`), NOT the configured `LONGCAT_EMBEDDING_MODEL`. That env var is unused. Knowledge search therefore has no API dependency and is local-only.
- Seed documents are loaded on startup via `OnModuleInit`; user uploads are persisted as JSON under gitignored `storage/` and restored on restart.
- POST `/knowledge/reindex` intentionally resets the knowledge base to static seed docs and clears persisted uploads.
- Chat history is cached per `sessionId` in `ChatService` and persisted to `storage/chat-history.json` after each completed response.

## API
- `POST /chat/stream` — SSE stream (`{ sessionId, question }`); emits `token` / `done` / `error` events over `text/event-stream`, with `done` carrying `fullResponse` and `sources`.
- `GET /knowledge/list`, `GET /knowledge/chunks?source=...`, `GET /knowledge/document/:source`, `POST /knowledge/upload` (multipart `file`; only `.txt/.md/.json/.csv`), `POST /knowledge/text`, `POST /knowledge/reindex`, `PUT/DELETE /knowledge/document/:source`.
- Static UI in `public/` is served by `ServeStaticModule`.

## Layout
- `src/chat/` — streaming chat controller/service, RAG retrieval + LLM call, in-memory chat history.
- `src/knowledge/` — vector store, local embeddings, seed docs, upload/reindex endpoints.
- `public/` — vanilla JS SPA (no build step).
- `uploads/` — gitignored upload dir (currently unused; files are read into memory via `FileInterceptor`).

## Styling
- All UI strings and seed content are Chinese; keep new copy in Chinese.
- `tsconfig` uses `experimentalDecorators`/`emitDecoratorMetadata` (NestJS default) and `noImplicitAny: false` — types are loosely enforced.
