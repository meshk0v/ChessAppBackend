const db = require('./db'); // Подключение к базе данных

// Функция сохранения результата игры
async function saveGameResult({ player1Id, player2Id, winnerId, gameFEN }) {
  const result = winnerId ? 'win' : 'draw';
  try {
    await db.query(
      `INSERT INTO games (player_1_id, player_2_id, winner_id, result, game_fen)
       VALUES ($1, $2, $3, $4, $5)`,
      [player1Id, player2Id, winnerId, result, gameFEN]
    );
    console.log('Результат игры успешно сохранён в базе данных.');
  } catch (err) {
    console.error('Ошибка сохранения результата игры:', err.message);
  }
}

// Функция обновления рейтингов игроков (Elo, K = 32)
async function updateRatings(player1Id, player2Id, winnerId) {
  try {
    const { rows: player1Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player1Id]);
    const { rows: player2Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player2Id]);

    if (!player1Data.length || !player2Data.length) {
      console.error(`[SERVER] Один из пользователей не найден в таблице рейтингов.`);
      return;
    }

    const player1Rating = player1Data[0].rating;
    const player2Rating = player2Data[0].rating;

    const kFactor = 32;
    const expectedScore1 = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
    const expectedScore2 = 1 / (1 + Math.pow(10, (player1Rating - player2Rating) / 400));

    let score1, score2;
    if (winnerId === player1Id) {
      score1 = 1; // Победа
      score2 = 0; // Проигрыш
    } else if (winnerId === player2Id) {
      score1 = 0; // Проигрыш
      score2 = 1; // Победа
    } else {
      score1 = 0.5; // Ничья
      score2 = 0.5; // Ничья
    }

    const newPlayer1Rating = Math.round(player1Rating + kFactor * (score1 - expectedScore1));
    const newPlayer2Rating = Math.round(player2Rating + kFactor * (score2 - expectedScore2));

    console.log(`[SERVER] Рейтинги: ${player1Id} ${player1Rating} → ${newPlayer1Rating}, ${player2Id} ${player2Rating} → ${newPlayer2Rating}`);

    const updateQuery = `UPDATE ratings SET rating = $1, max_rating = GREATEST(max_rating, $1) WHERE user_id = $2`;
    await db.query(updateQuery, [newPlayer1Rating, player1Id]);
    await db.query(updateQuery, [newPlayer2Rating, player2Id]);
  } catch (err) {
    console.error(`[SERVER] Ошибка при обновлении рейтингов: ${err.message}`);
  }
}

// Завершает игру ровно один раз: останавливает таймеры, сохраняет результат и обновляет рейтинги.
// Возвращает false, если игра уже была завершена раньше — тогда ничего не делаем.
async function finishGame(game, { player1Id, player2Id, winnerId }) {
  if (game.isOver) return false;
  game.isOver = true;
  game.isStarted = false;

  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
  if (game.disconnectTimeout) {
    clearTimeout(game.disconnectTimeout);
    game.disconnectTimeout = null;
  }

  // Результат пишем только для партии двух разных игроков
  if (player1Id && player2Id && player1Id !== player2Id) {
    await saveGameResult({ player1Id, player2Id, winnerId: winnerId || null, gameFEN: game.game.fen() });
    await updateRatings(player1Id, player2Id, winnerId || null);
  }
  return true;
}

module.exports = { finishGame };
