# AI Usage

This project was built by **Devin (Cognition AI)**, an autonomous AI software engineer, from a detailed written specification supplied by the user.

## What the AI did
- Chose the architecture and libraries within the requested stack (TipTap for rich text, `sanitize-html` for server-side HTML sanitization, `express-rate-limit`, `helmet`).
- Wrote all backend code: models, REST API, JWT auth, permission checks, Socket.IO rooms and presence, and optimistic-concurrency conflict detection.
- Wrote all frontend code: auth pages, dashboard, editor, sharing and conflict UIs, themes, and toasts.
- Wrote the automated test suite (25 tests) and ran it against both a real MongoDB 7 instance (Docker) and `mongodb-memory-server`. All tests pass.
- Upgraded dependencies to clear the `npm audit` advisories for production dependencies (React Router 7, TipTap 3, latest `sanitize-html`).
- Ran ESLint and the production build, and manually tested the running app with two separate accounts in a real browser.
- Wrote this documentation, including the limitations of the collaboration approach.

## Human responsibilities
- Review the code, especially the security-sensitive parts (`backend/src/middleware/auth.js`, `backend/src/routes/notes.js`, `backend/src/utils/sanitize.js`).
- Supply real secrets (`JWT_SECRET`, `MONGODB_URI`) in an untracked `.env`.
- Decide whether document-level optimistic locking is enough or whether CRDT-based co-editing (e.g. Yjs) is needed (see README → Known limitations).
