# Chess Battle — Backend

Backend for the [Chess Battle](https://github.com/meshk0v/ChessApp) Telegram Mini App: real-time games over Socket.IO, users, ratings and game history in PostgreSQL.

## Tech stack

Node.js · Express · Socket.IO · chess.js · PostgreSQL (`pg`)

## Getting started

```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN and DB_* values
npm start
```

The server listens on `PORT` (default `5000`).

### Environment variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather), used to fetch user avatars |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL credentials |
| `DB_HOST`, `DB_PORT` | PostgreSQL host and port (default `localhost:5432`) |
| `PORT` | HTTP/WebSocket port (default `5000`) |

The database needs the `users`, `ratings` and `games` tables. There are no migrations in the repo, so you have to create them yourself.

## REST API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users/check-or-add-user` | Register a Telegram user (generates a random nickname) |
| `GET` | `/api/users/leaderboard` | Top players by rating |
| `GET` | `/api/users/:id` | User profile |
| `PUT` | `/api/users/:telegram_id` | Update user |
| `GET` | `/api/users/get_rating/:userId` | User rating |
| `GET` | `/api/users/games/history/:userId` | Game history |
| `GET` | `/api/get_telegram_avatar/:user_id` | Telegram avatar URL (or a default image) |

## Socket.IO events

Client → server: `createGame`, `joinGame`, `findRandomGame`, `leaveGame`, `move`, `surrender`, `offerDraw`, `acceptDraw`, `rejectDraw`, `requestRematch`, `acceptRematch`, `sendEmotion`, `requestOpponentInfo`.

The server validates moves with chess.js, keeps the clocks in sync and sends game updates to both players. Active games are kept in memory, so they are lost when the server restarts.

## Structure

```
server.js            # Express + Socket.IO setup
db.js                # PostgreSQL pool
userHandler.js       # users, ratings, leaderboard, history
telegramAvatar.js    # avatar proxy via Telegram Bot API
socketHandlers/      # game, move, disconnect and common events
```
