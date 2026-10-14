# Inkwell — Collaborative Notes..

A full-stack, real-time collaborative notes app.

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + Vite, Tailwind CSS, TipTap rich-text editor, Lucide icons, React Router |
| Backend | Node.js + Express (ES modules), Socket.IO |
| Database | MongoDB + Mongoose |
| Auth | JWT (Bearer) + bcrypt (cost 12) |
| Tests | Node.js built-in test runner + Supertest + socket.io-client (MongoDB via `mongodb-memory-server` or a real URI) |

## Features

- **Auth:** register, log in, log out, persistent login (JWT in `localStorage`), protected routes, client- and server-side validation, rate-limited auth endpoints.
- **Dashboard:** My Notes / Shared With Me / Favorites, search (title + content), grid and list views, sort by recently updated, oldest, or alphabetical, loading skeletons, empty states. All data comes from the API.
- **Editor:** title and rich text (H1–H3, bold, italic, strikethrough, bullet, numbered and check lists, quotes, undo/redo). Debounced autosave (800 ms) with Saving / Saved / Unsaved / Error / Conflict status. Also: Ctrl/Cmd+S, word count, favorite, delete with confirmation, and protection against leaving with unsaved changes.
- **Collaboration:** invite registered users by email as **Viewer** or **Editor**, change or remove permissions, live presence avatars, live content updates without a refresh, auto-reconnect with resync, and immediate eviction when access is revoked or the note is deleted.
- **UI:** light and dark themes, responsive layout with a mobile drawer, toasts, keyboard-accessible dialogs (focus trap, Esc), ARIA labels.

## Project structure

```
collaborative-notes/
  backend/
    src/
      config.js, db.js, app.js, server.js, index.js
      models/        User.js, Note.js
      routes/        auth.js, notes.js
      middleware/    auth.js (JWT), error.js (central error handler)
      socket/        index.js (Socket.IO auth, rooms, presence, broadcasts)
      utils/         access.js, sanitize.js, serialize.js, validate.js, token.js, httpError.js
    test/            auth, notes (CRUD + conflicts), permissions, socket tests
  frontend/
    src/
      api/client.js            fetch wrapper + notes API
      context/                 Auth, Socket, Theme, Toast providers
      pages/                   AuthPages, Dashboard, NoteEditor
      components/              AppLayout, EditorToolbar, ShareModal, ConflictModal, Modal, Avatar, ...
  docker-compose.yml           local MongoDB
  .env.example
  README.md, AI_USAGE.md
```

## Setup

Prerequisites: Node.js 18.18 or later (20 LTS recommended) and MongoDB 6 or later (local, Docker, or Atlas).

```bash
# 1. Install dependencies
npm run install:all           # or: (cd backend && npm i) && (cd frontend && npm i)

# 2. Configure the backend
cp .env.example backend/.env  # then edit JWT_SECRET and MONGODB_URI

# 3. Start MongoDB (pick one)
docker compose up -d mongo    # local Docker
# or install MongoDB Community locally, or use Atlas (below)

# 4. Run in development (two terminals)
npm run dev:backend           # API + Socket.IO on http://localhost:5000
npm run dev:frontend          # Vite on http://localhost:5173 (proxies /api and /socket.io to :5000)
```

Open http://localhost:5173. To try collaboration, register two accounts in two browsers (or a normal window plus a private window), share a note from one account to the other, and open the note in both.

### MongoDB configuration

- **Local / Docker:** `MONGODB_URI=mongodb://127.0.0.1:27017/collaborative-notes`
- **MongoDB Atlas:**
  1. Create a free cluster at https://cloud.mongodb.com.
  2. Under *Database Access*, create a database user. Under *Network Access*, allow your IP (or your host's egress IPs).
  3. Click *Connect → Drivers* and copy the URI, then set
     `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/collaborative-notes?retryWrites=true&w=majority`

If the database is unreachable, the server logs the error and exits. It never runs without a database.

### Environment variables

| Variable | Where | Description |
| --- | --- | --- |
| `PORT` | backend | API port (default `5000`) |
| `MONGODB_URI` | backend | MongoDB connection string |
| `JWT_SECRET` | backend | **Required.** Long random string used to sign JWTs |
| `JWT_EXPIRES_IN` | backend | Token lifetime (default `7d`) |
| `CLIENT_ORIGIN` | backend | Comma-separated allowed origins for CORS and Socket.IO |
| `AUTH_RATE_LIMIT_MAX` | backend | Login/register attempts per IP per 15 minutes (default `20`) |
| `SERVE_FRONTEND` | backend | `true` serves `frontend/dist` from the API (single-port deploy) |
| `VITE_API_URL`, `VITE_SOCKET_URL` | frontend | Only needed if the API is on a different origin and there is no proxy |

Secrets stay on the backend. The frontend only receives the user's own JWT.

## Testing

```bash
cd backend
npm test                                                          # downloads a MongoDB binary via mongodb-memory-server on first run
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/notes-test npm test    # or use an existing MongoDB (the test DB is dropped afterwards)
```

There are 25 tests covering:

- registration, hashing, validation, duplicate emails, login, invalid credentials, invalid or missing tokens
- note create, read, update, delete, list, search, sort, HTML sanitization, per-user favorites
- private-by-default notes, viewers cannot edit, share, or delete, editors cannot manage collaborators, owners can change or remove collaborators
- Socket.IO connections without a valid token are rejected, unauthorized users cannot join a note room
- real-time updates and presence between two users, eviction on revoke, deletion broadcast
- version conflicts (stale `baseVersion` → 409) and atomicity under two simultaneous saves

Frontend checks: `cd frontend && npm run lint && npm run build`.

## API

All `/api/notes` routes require `Authorization: Bearer <token>`. Errors return `{ "error": "message" }` with an appropriate status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found / no access, 409 conflict, 413 too large, 429 rate limited).

| Method | Path | Who | Body / query | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | public | `{ name, email, password }` | `201 { token, user }` |
| POST | `/api/auth/login` | public | `{ email, password }` | `200 { token, user }` |
| GET | `/api/auth/me` | authed | – | `{ user }` |
| GET | `/api/notes` | authed | `?filter=all\|mine\|shared\|favorites&q=&sort=updated\|oldest\|alpha` | `{ notes: NoteSummary[] }` |
| POST | `/api/notes` | authed | `{ title?, content? }` | `201 { note }` |
| GET | `/api/notes/:id` | owner, editor, viewer | – | `{ note }` |
| PUT | `/api/notes/:id` | owner, editor | `{ title?, content?, baseVersion }` | `{ note }` or `409 { conflict: true, note }` |
| DELETE | `/api/notes/:id` | owner | – | `204` |
| PATCH | `/api/notes/:id/favorite` | anyone with access | `{ favorite: boolean }` | `{ noteId, isFavorite }` |
| POST | `/api/notes/:id/collaborators` | owner | `{ email, permission: "viewer"\|"editor" }` | `201 { note }` |
| PATCH | `/api/notes/:id/collaborators/:userId` | owner | `{ permission }` | `{ note }` |
| DELETE | `/api/notes/:id/collaborators/:userId` | owner | – | `{ note }` |
| GET | `/api/health` | public | – | `{ status: "ok" }` |

A user without access to a note gets **404**, not 403, so private note IDs are not revealed. `content` is HTML from TipTap. The server sanitizes it with an allow-list (`sanitize-html`) and also stores a plain-text copy for search and previews.

### Socket.IO events

The connection requires `auth: { token }`. Connections with a missing or invalid token are rejected with `connect_error`.

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `note:join` (ack) | `{ noteId }` → `{ ok, permission, users }` or `{ ok: false, error }`. The server checks access in the DB before joining the room. |
| client → server | `note:leave` | `{ noteId }` |
| server → room | `presence:update` | `{ noteId, users: [{ id, name, permission }] }` |
| server → room | `note:updated` | `{ noteId, title, content, version, updatedAt, updatedBy }`. Not sent back to the socket that saved (`X-Socket-Id` header). |
| server → room | `note:collaborators` | `{ noteId, collaborators }` |
| server → room | `note:permission-changed` | `{ noteId, userId, permission }` |
| server → user | `note:access-revoked` | `{ noteId }`. The server also removes that user's sockets from the room. |
| server → room | `note:deleted` | `{ noteId, by }` |

All edits go through `PUT /api/notes/:id`, so REST and real-time clients use the same permission and version checks. Sockets are only used to push changes.

## Collaboration and conflict strategy

Each note has an integer `version`. A save sends the `baseVersion` it was based on. The server applies it with a single atomic `findOneAndUpdate({ _id, version: baseVersion }, { $set, $inc: { version: 1 } })`. If someone else saved first, nothing is written and the API returns **409** with the latest note. Two concurrent saves can never both succeed (there is a test for this).

On the client:
- If a remote update arrives and you have **no unsaved edits**, it is applied right away (cursor position is kept where possible).
- If you **do** have unsaved edits, or your save gets a 409, the editor enters **Conflict** mode. Autosave pauses and a banner offers *Compare* (side-by-side), *Use theirs*, or *Keep mine* (re-saves your version on top of the latest one). Nothing is silently overwritten.
- After a reconnect, the client rejoins the room and refetches the note to catch up on anything it missed.

### Known limitations (honest)

- **Not character-level merging.** This is optimistic locking at the document level, not OT or CRDT (Yjs/Automerge). If two people type in the same note at the same moment, one of them gets a conflict prompt and must choose a version. Merging is manual (copy from the Compare dialog). True simultaneous co-editing would need something like Yjs + `y-prosemirror`.
- No remote cursors or selections. Presence is shown per note, not per position.
- Presence is kept in memory on a single server process. Scaling to multiple instances needs the Socket.IO Redis adapter (`@socket.io/redis-adapter`) and sticky sessions.
- The JWT is stored in `localStorage` for persistent login. That is simple, but any XSS on the page could read it. Content is sanitized on the server and rendered by ProseMirror (no `dangerouslySetInnerHTML`), which reduces that risk. An httpOnly cookie plus CSRF protection would be stronger. Logging out clears the token on the client, but there is no server-side token revocation list.
- Sharing only works with users who are already registered. There are no email invitations.

## Deployment

**Single service (simplest):**
```bash
npm run install:all && npm run build
SERVE_FRONTEND=true NODE_ENV=production MONGODB_URI=... JWT_SECRET=... CLIENT_ORIGIN=https://your.domain npm --prefix backend start
```
This runs the API, Socket.IO and the built SPA on one port. Put it behind a TLS-terminating proxy (Nginx, Caddy, Render, Railway, Fly.io) that supports WebSockets.

**Split hosting:** deploy `frontend/dist` to a static host (Netlify or Vercel) with `VITE_API_URL` and `VITE_SOCKET_URL` set at build time. Deploy `backend` to a Node host with `CLIENT_ORIGIN` set to the frontend URL. Use MongoDB Atlas for the database.

Production checklist: a strong `JWT_SECRET`, HTTPS only, restricted Atlas network access, and `CLIENT_ORIGIN` set to your exact domains.
