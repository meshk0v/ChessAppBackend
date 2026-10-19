# Chess Battle — Backend

Backend for the [Chess Battle](https://github.com/meshk0v/ChessApp) Telegram Mini App: real-time games over Socket.IO, users, ratings and game history in PostgreSQL.

## Tech stack

Node.js · Express · Socket.IO · chess.js · PostgreSQL (`pg`)

## Getting started

```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN and DB_* values
psql -U chess_user -d chessdb -f schema.sql
npm start
```

The server listens on `PORT` (default `5000`).

### Environment variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather), used to verify `initData` and fetch avatars |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL credentials |
| `DB_HOST`, `DB_PORT` | PostgreSQL host and port (default `localhost:5432`) |
| `PORT` | HTTP/WebSocket port (default `5000`) |
| `CORS_ORIGINS` | Comma-separated frontend origins allowed to call the API (default `https://chess-battle.space`) |
| `INIT_DATA_MAX_AGE` | How long Telegram `initData` stays valid, in seconds (default `86400`) |

`schema.sql` creates the `users`, `ratings` and `games` tables. It was reconstructed from the queries in the code, so check it against an existing database before applying.

## Authentication

Every Socket.IO connection and every write request must carry the Mini App's signed [`initData`](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app): in `auth.initData` for sockets, and in the `X-Telegram-Init-Data` header for HTTP. The server checks the signature with `BOT_TOKEN` and takes the user id from it, never from the request body.

## REST API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users/check-or-add-user` | Register the current Telegram user (generates a random nickname) · auth |
| `GET` | `/api/users/leaderboard` | Top players by rating |
| `GET` | `/api/users/:id` | User profile |
| `PUT` | `/api/users/:telegram_id` | Change your own username · auth |
| `GET` | `/api/users/get_rating/:userId` | User rating |
| `GET` | `/api/users/games/history/:userId` | Game history |
| `GET` | `/api/get_telegram_avatar/:user_id` | Telegram avatar URL (or a default image) |

## Socket.IO events

Client → server: `createGame`, `joinGame`, `findRandomGame`, `leaveGame`, `move`, `surrender`, `offerDraw`, `acceptDraw`, `rejectDraw`, `requestRematch`, `acceptRematch`, `sendEmotion`, `requestOpponentInfo`.

The server validates moves with chess.js, keeps the clocks in sync and sends game updates to both players. Active games are kept in memory, so they are lost when the server restarts.

## Structure

```
server.js            # Express + Socket.IO setup, game clock
auth.js              # Telegram initData verification (HTTP + Socket.IO)
gameResult.js        # finishing a game: save result, update Elo ratings
db.js                # PostgreSQL pool
schema.sql           # database tables
userHandler.js       # users, ratings, leaderboard, history
telegramAvatar.js    # avatar proxy via Telegram Bot API
socketHandlers/      # game, move, disconnect and common events
```
