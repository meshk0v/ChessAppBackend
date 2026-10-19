const express = require('express');
const db = require('./db'); // Подключаем модуль работы с базой
const { requireTelegramUser } = require('./auth');
const router = express.Router();

const { uniqueNamesGenerator, adjectives, animals } = require('unique-names-generator');

// Конфигурация для генерации уникальных имен
const customConfig = {
  dictionaries: [adjectives, animals], // Используем прилагательные и животные
  separator: '', // Без пробелов или символов между словами
  length: 2, // Количество слов
};

// Эндпоинт для проверки и добавления пользователя
router.post('/check-or-add-user', requireTelegramUser, async (req, res) => {
  let { username, first_name, last_name, avatar_url } = req.body;
  const telegram_id = req.tgUser.id; // id берём только из проверенных данных Telegram

  try {
    // Генерация уникального никнейма, если username = 'unknown'
    if (username === 'unknown') {
      let isUnique = false;
      while (!isUnique) {
        const generatedNickname = uniqueNamesGenerator(customConfig); // Пример: "FunkyTiger"
        const checkQuery = `SELECT COUNT(*) FROM users WHERE username = $1;`;
        const checkResult = await db.query(checkQuery, [generatedNickname]);

        if (parseInt(checkResult.rows[0].count, 10) === 0) {
          username = generatedNickname;
          isUnique = true;
        }
      }
    }

    // Вставка данных пользователя в таблицу users
    const query = `
      INSERT INTO users (telegram_id, username, first_name, last_name, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (telegram_id) DO NOTHING
      RETURNING telegram_id;
    `;
    const result = await db.query(query, [telegram_id, username, first_name, last_name, avatar_url]);

    if (result.rows.length > 0) {
      console.log(`User ${telegram_id} добавлен в базу данных.`);

      // Вставка данных в таблицу ratings
      const addRatingQuery = `
        INSERT INTO ratings (user_id, rating, max_rating)
        VALUES ($1, 1200, 1200)
        ON CONFLICT (user_id) DO NOTHING;
      `;
      await db.query(addRatingQuery, [telegram_id]); // Используем telegram_id вместо id

      res.status(200).json({ message: 'User added successfully.', telegram_id: result.rows[0].telegram_id });
    } else {
      console.log(`User ${telegram_id} уже существует в базе данных.`);
      res.status(200).json({ message: 'User already exists.', telegram_id });
    }
  } catch (error) {
    console.error('Ошибка при добавлении пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});



// Эндпоинт для получения топ-игроков
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboardQuery = `
      SELECT 
        u.username, 
        u.telegram_id, 
        u.avatar_url, 
        r.rating
      FROM 
        users u
      JOIN 
        ratings r
      ON 
        u.telegram_id = r.user_id
      ORDER BY 
        r.rating DESC
      LIMIT 100
    `;
    const result = await db.query(leaderboardQuery);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении лидерборда:', error);
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});


router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userQuery = `
SELECT 
  u.telegram_id,
  u.username,
  u.avatar_url,
  COALESCE(r.rating, 1200) AS rating,
  COUNT(g.id) AS games_played,
  COUNT(CASE WHEN g.winner_id = u.telegram_id THEN 1 END) AS games_won,
  COUNT(CASE WHEN g.winner_id != u.telegram_id AND g.winner_id IS NOT NULL THEN 1 END) AS games_lost
FROM users u
LEFT JOIN games g ON g.player_1_id = u.telegram_id OR g.player_2_id = u.telegram_id
LEFT JOIN ratings r ON u.telegram_id = r.user_id
WHERE u.telegram_id = $1
GROUP BY u.telegram_id, u.username, u.avatar_url, r.rating;

        `;

    const result = await db.query(userQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при получении данных пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});

router.put('/:telegram_id', requireTelegramUser, async (req, res) => {
  const { telegram_id } = req.params;
  const { username } = req.body;

  // Менять можно только своё имя
  if (String(req.tgUser.id) !== String(telegram_id)) {
    return res.status(403).json({ message: 'Можно изменить только своё имя пользователя' });
  }

  if (typeof username !== 'string' || !username.trim() || username.length > 32) {
    return res.status(400).json({ message: 'Имя пользователя должно быть от 1 до 32 символов' });
  }

  try {
    // Проверяем, существует ли уже такое имя пользователя
    const checkQuery = `SELECT COUNT(*) FROM users WHERE username = $1 AND telegram_id != $2`;
    const checkResult = await db.query(checkQuery, [username, telegram_id]);

    if (parseInt(checkResult.rows[0].count, 10) > 0) {
      // Имя пользователя уже существует
      return res.status(400).json({ message: 'Это имя пользователя уже занято' });
    }

    // Выполняем обновление, если имя уникально
    await db.query('UPDATE users SET username = $1 WHERE telegram_id = $2', [username, telegram_id]);
    res.status(200).json({ message: 'Имя пользователя обновлено' });
  } catch (error) {
    console.error('Ошибка при обновлении имени пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.get('/get_rating/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      'SELECT rating FROM ratings WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length > 0) {
      res.status(200).json({ rating: result.rows[0].rating });
    } else {
      res.status(404).json({ message: 'Рейтинг пользователя не найден.' });
    }
  } catch (error) {
    console.error('Ошибка при получении рейтинга:', error);
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});

router.get('/games/history/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const query = `
      SELECT 
        g.id AS game_id,
        CASE 
          WHEN g.player_1_id = $1 THEN u2.username
          ELSE u1.username
        END AS opponent_username,
        CASE 
          WHEN g.winner_id = $1 THEN 'win'
          WHEN g.winner_id IS NULL THEN 'draw'
          ELSE 'loss'
        END AS result,
        g.start_time
      FROM games g
      LEFT JOIN users u1 ON g.player_1_id = u1.telegram_id
      LEFT JOIN users u2 ON g.player_2_id = u2.telegram_id
      WHERE g.player_1_id = $1 OR g.player_2_id = $1
      ORDER BY g.start_time DESC
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(200).json([]); // Пустой массив, если нет игр
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении истории игр:', error);
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});

module.exports = router;
