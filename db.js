const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,                    // Имя пользователя PostgreSQL
  host: process.env.DB_HOST || 'localhost',     // Хост базы данных
  database: process.env.DB_NAME,                // Название базы данных
  password: process.env.DB_PASSWORD,            // Пароль пользователя
  port: Number(process.env.DB_PORT) || 5432,    // Порт PostgreSQL (по умолчанию 5432)
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
