# Chatly

Chatly is a real-time chat application with a NestJS/PostgreSQL backend and a React/Vite frontend.

## Features

- Account registration and sign-in
- JWT access and refresh tokens
- Real-time communication with Socket.IO
- Conversation list and message history
- Direct conversations between registered users
- User search when starting a conversation
- Responsive green and blue chat interface

## Project structure

```text
chat-app/
├── backend/   # NestJS API, PostgreSQL, TypeORM, Socket.IO
└── frontend/  # React, TypeScript, Vite
```

## Requirements

- Node.js 20 or newer
- pnpm
- PostgreSQL 14 or newer

The backend uses `pnpm@12.17.0`. Corepack can enable the package manager:

```powershell
corepack enable
```

## Backend setup

Open a terminal in `backend`:

```powershell
cd backend
pnpm install
Copy-Item .env.example .env
```

Edit `.env` with the PostgreSQL connection details and authentication key paths.
Do not commit `.env` or private key files.

The authentication key files expected by the development configuration are:

```text
backend/keys/access_private.key
backend/keys/access_public.key
backend/keys/refresh_private.key
backend/keys/refresh_public.key
```

Run the database migrations once before starting the API:

```powershell
pnpm run build
pnpm exec typeorm-ts-node-commonjs migration:run -d src/infrastructure/database/postgres/config/data-source.ts
```

Migrations are intentionally not run automatically during application startup. This prevents watch-mode restarts from repeatedly retrying a failed migration or holding database locks.

Start the backend:

```powershell
pnpm run start:dev
```

The backend runs on `http://localhost:3000` by default. Swagger documentation is available at:

```text
http://localhost:3000/swagger
```

## Frontend setup

Open another terminal in `frontend`:

```powershell
cd frontend
pnpm install
```

The frontend defaults to `http://localhost:3000` for the backend. To use another backend URL, create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

Start the frontend:

```powershell
pnpm run dev
```

The Vite development server runs on `http://localhost:5173` by default.

## Chat flow

The frontend authenticates through:

```text
POST /v1/auth/signup
POST /v1/auth/signin
```

After sign-in, it connects to the Socket.IO namespace:

```text
/chat
```

The socket uses the access token as a Bearer token and communicates with these events:

```text
conversation.list
conversation.message.list
conversation.message.send
conversation.create
conversation.message.sent
user.search
```

To start a direct conversation, use **New conversation**, search for a registered user, select them, and send the first message.

## Validation commands

Backend:

```powershell
cd backend
pnpm run typecheck
pnpm run build
```

Frontend:

```powershell
cd frontend
pnpm run build
```

The frontend lint command may require a TypeScript version supported by the installed `typescript-eslint` release.

## Database notes

The application uses its own PostgreSQL schemas:

- `user` for users and blocks
- `chat` for conversations and messages
- `app_auth` for refresh tokens

The `app_auth` schema is intentional. Managed PostgreSQL services such as Supabase reserve the `auth` schema, so the application must not attempt to create tables there.
