const db = require('../db'); // Подключение к базе данных
module.exports = (io, socket, games) => {
  const handlePlayerDisconnection = async (gameId, socketId) => {
    const game = games[gameId];
    if (!game) return;

    const disconnectedPlayer = game.players.find(player => player.id === socketId);
    const remainingPlayer = game.players.find(player => player.id !== socketId);
    const remainingColor = remainingPlayer && game.colors[remainingPlayer.id] === 'white' ? 'White' : 'Black';

    console.log(`[DISCONNECT] Игрок ${disconnectedPlayer?.userId || 'неизвестный'} отключился.`);

    // Убираем отключенного игрока
    game.players = game.players.filter(player => player.id !== socketId);

    if (game.players.length === 0) {
      clearInterval(game.timerInterval); // Останавливаем таймер
      setTimeout(() => {
        if (games[gameId]) {
          console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
          delete games[gameId];
        }
      }, 100000); // 100 секунд задержки перед удалением старой игры

      console.log(`Игра ${gameId} завершена и удалена, так как в ней нет игроков.`);
    } else if (remainingPlayer) {
      io.to(remainingPlayer.id).emit('opponentDisconnected', { timeout: 10 });

      if (!game.disconnectTimeout) {
        game.disconnectTimeout = setTimeout(async () => {
          if (games[gameId] && games[gameId].players.length === 1) {
            io.to(remainingPlayer.id).emit('gameEnded', {
              message: `Victory: ${remainingColor}. Your opponent did not return to the game.`,
            });

            console.log(`[GAME ENDED] Победа: ${remainingColor}. Игра ${gameId} завершена из-за отсутствия противника.`);

            const winnerId = remainingPlayer.userId;
            const loserId = disconnectedPlayer?.userId || null;

            // Проверяем, что оба игрока существуют
            if (game.players.length === 1 && disconnectedPlayer) {
              // Сохраняем результаты в базу данных
              await saveGameResult({
                player1Id: game.players[0]?.userId || disconnectedPlayer.userId,
                player2Id: disconnectedPlayer.userId,
                winnerId,
                gameFEN: game.game.fen(),
              });

              // Обновляем рейтинги
              await updateRatings(game.players[0]?.userId, disconnectedPlayer.userId, winnerId);
            }

            clearInterval(game.timerInterval); // Останавливаем таймер
            setTimeout(() => {
              if (games[gameId]) {
                console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
                delete games[gameId];
              }
            }, 100000); // 100 секунд задержки перед удалением старой игры

          }
        }, 10000); // Ждем 10 секунд
      }
    }
  };

  // Обработка отключения игрока
  socket.on('disconnect', () => {
    console.log('Клиент отключен:', socket.id);

    for (let gameId in games) {
      if (games[gameId].players.some(player => player.id === socket.id)) {
        handlePlayerDisconnection(gameId, socket.id);
        break;
      }
    }
  });

  // Обработка выхода игрока из игры
  socket.on('leaveGame', async ({ gameId, userId }) => {
    const game = games[gameId];
    if (!game) return;

    const leavingPlayer = game.players.find(player => player.userId === userId);
    const remainingPlayer = game.players.find(player => player.userId !== userId);
    if (!leavingPlayer) return;

    console.log(`Игрок ${userId} покинул игру ${gameId}`);

    const winnerId = remainingPlayer?.userId || null;

    // Проверяем, что оба игрока существуют
    if (remainingPlayer && leavingPlayer) {
      // Сохраняем результаты в базу данных
      await saveGameResult({
        player1Id: remainingPlayer.userId,
        player2Id: leavingPlayer.userId,
        winnerId,
        gameFEN: game.game.fen(),
      });

      // Обновляем рейтинги
      await updateRatings(remainingPlayer.userId, leavingPlayer.userId, winnerId);
    }

    handlePlayerDisconnection(gameId, leavingPlayer.id);
  });
};

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

// Функция обновления рейтингов игроков
async function updateRatings(player1Id, player2Id, winnerId) {
  try {
    console.log(`[SERVER] Обновление рейтингов для игроков: ${player1Id}, ${player2Id}. Победитель: ${winnerId}`);

    // Получаем текущие рейтинги игроков
    const { rows: player1Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player1Id]);
    const { rows: player2Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player2Id]);

    if (!player1Data.length || !player2Data.length) {
      console.error(`[SERVER] Один из пользователей не найден в таблице рейтингов.`);
      return;
    }

    const player1Rating = player1Data[0].rating;
    const player2Rating = player2Data[0].rating;

    // Рассчитываем изменение рейтинга
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

    console.log(`[SERVER] Новые рейтинги: Player 1: ${newPlayer1Rating}, Player 2: ${newPlayer2Rating}`);

    // Обновляем рейтинги в базе данных
    await db.query(`UPDATE ratings SET rating = $1 WHERE user_id = $2`, [newPlayer1Rating, player1Id]);
    await db.query(`UPDATE ratings SET rating = $1 WHERE user_id = $2`, [newPlayer2Rating, player2Id]);

    console.log(`[SERVER] Рейтинги успешно обновлены.`);
  } catch (err) {
    console.error(`[SERVER] Ошибка при обновлении рейтингов: ${err.message}`);
  }
}
