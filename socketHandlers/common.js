const db = require('../db'); // Подключение к базе данных

module.exports = (io, socket, games) => {
  socket.on('requestOpponentInfo', ({ gameId }) => {
    const game = games[gameId];
    if (game && game.players.length === 2) {
      const opponent = game.players.find(player => player.id !== socket.id);
      if (opponent) {
        socket.emit('opponentInfo', { opponentId: opponent.userId });
      }
    }
  });
  
  socket.on('surrender', async ({ gameId }) => {
    const game = games[gameId];
    if (!game) {
      socket.emit('error', { message: 'Game not found.' });
      return;
    }

    const surrenderingPlayer = game.players.find(player => player.id === socket.id);
    const opponentPlayer = game.players.find(player => player.id !== socket.id);

    if (!surrenderingPlayer) {
      socket.emit('error', { message: 'Player not found.' });
      return;
    }

    // Определяем цвет сдающегося игрока и его оппонента
    const surrenderingColor = game.colors[surrenderingPlayer.id];
    const opponentColor = surrenderingColor === 'white' ? 'Черные' : 'Белые';

    // Определяем победителя
    const winnerId = opponentPlayer?.userId;
    const loserId = surrenderingPlayer?.userId;

    // Отправляем сообщение о завершении игры
    io.to(gameId).emit('gameEnded', {
      message: `${surrenderingColor === 'white' ? 'White' : 'Black'} surrendered. Winner: ${opponentColor}.`,
    });

    console.log(`[SURRENDER] Игрок с цветом ${surrenderingColor} сдался в игре ${gameId}. Победитель: ${winnerId}`);

    // Сохраняем результат в базу данных
    if (winnerId && loserId) {
      await saveGameResult({
        player1Id: game.players[0]?.userId,
        player2Id: game.players[1]?.userId,
        winnerId,
        gameFEN: game.game.fen(),
      });

      // Обновляем рейтинги
      await updateRatings(game.players[0]?.userId, game.players[1]?.userId, winnerId);
    }

    // Останавливаем таймер и удаляем игру
    if (game.timerInterval) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
    }

    setTimeout(() => {
      if (games[gameId]) {
        console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
        delete games[gameId];
      }
    }, 100000); // 100 секунд задержки перед удалением старой игры

  });


socket.on('offerDraw', ({ gameId }, callback) => {
  const game = games[gameId];
  if (!game) {
    callback({ status: 'error', message: 'Game not found.' });
    return;
  }

  if (game.drawOfferedBy) {
    callback({ status: 'error', message: 'A draw has already been offered. Please wait for a response.' });
    return;
  }

  const opponent = game.players.find(player => player.id !== socket.id);
  if (!opponent) {
    callback({ status: 'error', message: 'Opponent not found.' });
    return;
  }

  game.drawOfferedBy = socket.id; // Устанавливаем, кто предложил ничью
  io.to(opponent.id).emit('drawOffered', {
    message: 'Your opponent is offering a draw. Do you accept?',
  });

  console.log(`[DRAW] Игрок ${socket.id} предложил ничью в игре ${gameId}.`);
  callback({ status: 'success' });
});

socket.on('acceptDraw', async ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    return;
  }

  // Отправляем сообщение об окончании игры
  io.to(gameId).emit('gameEnded', {
    message: 'The game is over. Result: draw.',
  });

  console.log(`[DRAW] Ничья принята в игре ${gameId}.`);

  // Сохраняем результат в базу данных
  await saveGameResult({
    player1Id: game.players[0]?.userId,
    player2Id: game.players[1]?.userId,
    winnerId: null, // Ничья, победителя нет
    gameFEN: game.game.fen(),
  });

  // Обновляем рейтинги игроков
  if (game.players.length === 2) {
    await updateRatings(game.players[0]?.userId, game.players[1]?.userId, null); // Передаём null как победителя
  }

  // Останавливаем таймер игры
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }

  setTimeout(() => {
    if (games[gameId]) {
      console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
      delete games[gameId];
    }
  }, 100000); // 100 секунд задержки перед удалением старой игры
});



socket.on('rejectDraw', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    return;
  }

  const opponent = game.players.find(player => player.id !== socket.id);
  if (opponent) {
    io.to(opponent.id).emit('drawRejected', {
      message: 'Your opponent has declined your draw offer.',
    });
  }

  console.log(`[DRAW] Ничья отклонена в игре ${gameId}.`);
  delete game.drawOfferedBy; // Сбрасываем предложение ничьей
});
socket.on('sendEmotion', ({ gameId, senderId, emotion }) => {
  if (!gameId) {
    console.error('Ошибка: gameId не передан.');
    return;
  }
  if (!senderId) {
    console.error('Ошибка: senderId (userId) не передан.');
    return;
  }

  console.log(`Получено событие sendEmotion. gameId: ${gameId}, senderId (userId): ${senderId}, emotion: ${emotion}`);
  
  // Отправляем эмоцию всем в комнате (в игре)
  io.to(gameId).emit('receiveEmotion', { senderId, emotion });
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
