const { Pool } = require('pg');

const pool = new Pool({
  user: 'chess_user',       // Имя пользователя PostgreSQL
  host: 'localhost',           // Хост базы данных
  database: 'chessdb',        // Название базы данных
  password: process.env.DB_PASSWORD,   // Пароль пользователя
  port: 5432,                  // Порт PostgreSQL (по умолчанию 5432)
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
