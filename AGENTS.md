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
- Knowledge search is a **pure-JS BM25 retriever with CJK unigram+bigram tokenization** (`src/knowledge/local-vector-store.ts`), NOT the configured `LONGCAT_EMBEDDING_MODEL`. That env var is unused. Retrieval has no API dependency and is local-only; document titles (`metadata.source`) are boosted ×2 in scoring.
- The knowledge base has **three layers**, merged in order (same `source` name: later layer wins): built-in seeds (`src/knowledge/data/seed-documents.ts`) → custom JSON (`src/knowledge/data/custom-documents.json`, committed, edit this file directly for your own knowledge) → runtime uploads (gitignored `storage/uploads.json`, managed via the UI). `GET /knowledge/list` returns each document's `origin` (`builtin`/`custom`/`upload`).
- Deleting a document via the UI only removes it until the next restart when its origin is `builtin`/`custom` (the source file is never modified); `upload` deletions are permanent. The management UI warns about this per origin.
- POST `/knowledge/reindex` rebuilds from seeds + custom JSON and **clears runtime uploads**, after backing them up to `storage/uploads.backup-<ts>.json`.
- Chat history is cached per `sessionId` in `ChatService` and persisted to `storage/chat-history.json` after each completed response.
- Retrieval quality can be checked offline: `npm run build && node scripts/verify-retrieval.mjs` (loads seeds + custom JSON, reports top-1/3/6 hit rates for sample questions).

## API
- `POST /chat/stream` — SSE stream (`{ sessionId, question }`); emits `token` / `done` / `error` events over `text/event-stream`, with `done` carrying `fullResponse` and `sources`.
- `GET /knowledge/list`, `GET /knowledge/chunks?source=...`, `GET /knowledge/document/:source`, `POST /knowledge/upload` (multipart `file`; only `.txt/.md/.json/.csv`), `POST /knowledge/text`, `POST /knowledge/reindex`, `PUT/DELETE /knowledge/document/:source`.
- Static UI in `public/` is served by `ServeStaticModule`.

## Layout
- `src/chat/` — streaming chat controller/service, RAG retrieval + LLM call, in-memory chat history.
- `src/knowledge/` — BM25 vector store + CJK tokenizer (`local-vector-store.ts`), seed docs, upload/reindex endpoints.
- `public/` — vanilla JS SPA (no build step). Doubles as the knowledge base management console: list / view chunks / edit / delete / upload / add text / reindex. Management is intended to happen ONLY here; the H5 frontend's knowledge panel is view-only.
- `uploads/` — gitignored upload dir (currently unused; files are read into memory via `FileInterceptor`).

## Styling
- All UI strings and seed content are Chinese; keep new copy in Chinese.
- `tsconfig` uses `experimentalDecorators`/`emitDecoratorMetadata` (NestJS default) and `noImplicitAny: false` — types are loosely enforced.
