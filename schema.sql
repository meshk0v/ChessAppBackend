-- Схема базы данных Chess Battle.
-- Восстановлена по SQL-запросам в коде; если на сервере таблицы уже есть, сверьте типы перед применением.
-- Применить: psql -U chess_user -d chessdb -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username    TEXT UNIQUE,
  first_name  TEXT,
  last_name   TEXT,
  avatar_url  TEXT
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id    BIGINT PRIMARY KEY REFERENCES users (telegram_id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL DEFAULT 1200,
  max_rating INTEGER NOT NULL DEFAULT 1200
);

CREATE TABLE IF NOT EXISTS games (
  id          SERIAL PRIMARY KEY,
  player_1_id BIGINT REFERENCES users (telegram_id),
  player_2_id BIGINT REFERENCES users (telegram_id),
  winner_id   BIGINT REFERENCES users (telegram_id),
  result      TEXT NOT NULL,          -- 'win' или 'draw'
  game_fen    TEXT,
  start_time  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_player_1_idx ON games (player_1_id);
CREATE INDEX IF NOT EXISTS games_player_2_idx ON games (player_2_id);
