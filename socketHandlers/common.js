const { finishGame } = require('../gameResult');

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

    if (game.isOver) return; // Игра уже завершена — повторная сдача ничего не меняет

    // Определяем цвет сдающегося игрока и его оппонента
    const surrenderingColor = game.colors[surrenderingPlayer.id];
    const opponentColor = surrenderingColor === 'white' ? 'Black' : 'White';

    // Определяем победителя
    const winnerId = opponentPlayer?.userId;

    // Отправляем сообщение о завершении игры
    io.to(gameId).emit('gameEnded', {
      message: `${surrenderingColor === 'white' ? 'White' : 'Black'} surrendered. Winner: ${opponentColor}.`,
    });

    console.log(`[SURRENDER] Игрок с цветом ${surrenderingColor} сдался в игре ${gameId}. Победитель: ${winnerId}`);

    // Сохраняем результат, обновляем рейтинги и останавливаем таймеры (ровно один раз)
    await finishGame(game, {
      player1Id: game.players[0]?.userId,
      player2Id: game.players[1]?.userId,
      winnerId,
    });

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

  if (game.isOver || !game.players.some(player => player.id === socket.id)) {
    callback({ status: 'error', message: 'You cannot offer a draw in this game.' });
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
  if (!game || game.isOver) {
    return;
  }

  // Принять ничью может только соперник того, кто её предложил
  const isPlayer = game.players.some(player => player.id === socket.id);
  if (!isPlayer || !game.drawOfferedBy || game.drawOfferedBy === socket.id) {
    return;
  }
  delete game.drawOfferedBy;

  // Отправляем сообщение об окончании игры
  io.to(gameId).emit('gameEnded', {
    message: 'The game is over. Result: draw.',
  });

  console.log(`[DRAW] Ничья принята в игре ${gameId}.`);

  // Сохраняем ничью, обновляем рейтинги и останавливаем таймеры (ровно один раз)
  await finishGame(game, {
    player1Id: game.players[0]?.userId,
    player2Id: game.players[1]?.userId,
    winnerId: null,
  });

  setTimeout(() => {
    if (games[gameId]) {
      console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
      delete games[gameId];
    }
  }, 100000); // 100 секунд задержки перед удалением старой игры
});



socket.on('rejectDraw', ({ gameId }) => {
  const game = games[gameId];
  if (!game || !game.drawOfferedBy || game.drawOfferedBy === socket.id) {
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
socket.on('sendEmotion', ({ gameId, emotion }) => {
  const game = games[gameId];
  // Эмоции может отправлять только участник этой игры
  if (!game || !game.players.some(player => player.id === socket.id)) {
    return;
  }
  const senderId = socket.data.userId; // id из проверенных данных Telegram

  io.to(gameId).emit('receiveEmotion', { senderId, emotion });
});

  };
