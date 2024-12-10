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
  
socket.on('surrender', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    socket.emit('error', { message: 'Игра не найдена.' });
    return;
  }

  const surrenderingPlayer = game.players.find(player => player.id === socket.id);
  const opponentPlayer = game.players.find(player => player.id !== socket.id);

  if (!surrenderingPlayer) {
    socket.emit('error', { message: 'Игрок не найден.' });
    return;
  }

  // Определяем цвет сдающегося игрока и его оппонента
  const surrenderingColor = game.colors[surrenderingPlayer.id];
  const opponentColor = surrenderingColor === 'white' ? 'Черные' : 'Белые';

  // Отправляем сообщение о завершении игры
  io.to(gameId).emit('gameEnded', {
    message: `${surrenderingColor === 'white' ? 'Белые' : 'Черные'} сдались. Победитель ${opponentColor}.`,
  });

  console.log(`[SURRENDER] Игрок с цветом ${surrenderingColor} сдался в игре ${gameId}.`);

  // Останавливаем таймер и удаляем игру
  if (game.timerInterval) {
    clearInterval(game.timerInterval); // Останавливаем таймер
    game.timerInterval = null;
  }

  delete games[gameId]; // Полностью удаляем игру
});


socket.on('offerDraw', ({ gameId }, callback) => {
  const game = games[gameId];
  if (!game) {
    callback({ status: 'error', message: 'Игра не найдена.' });
    return;
  }

  if (game.drawOfferedBy) {
    callback({ status: 'error', message: 'Ничья уже предложена. Дождитесь ответа.' });
    return;
  }

  const opponent = game.players.find(player => player.id !== socket.id);
  if (!opponent) {
    callback({ status: 'error', message: 'Противник не найден.' });
    return;
  }

  game.drawOfferedBy = socket.id; // Устанавливаем, кто предложил ничью
  io.to(opponent.id).emit('drawOffered', {
    message: 'Ваш соперник предлагает ничью. Вы принимаете?',
  });

  console.log(`[DRAW] Игрок ${socket.id} предложил ничью в игре ${gameId}.`);
  callback({ status: 'success' });
});

socket.on('acceptDraw', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    return;
  }

  // Отправляем сообщение об окончании игры
  io.to(gameId).emit('gameEnded', {
    message: 'Игра завершена. Результат: ничья.',
  });

  console.log(`[DRAW] Ничья принята в игре ${gameId}.`);

  // Останавливаем таймер игры
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }

  delete games[gameId]; // Удаляем игру из памяти
});

socket.on('rejectDraw', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    return;
  }

  const opponent = game.players.find(player => player.id !== socket.id);
  if (opponent) {
    io.to(opponent.id).emit('drawRejected', {
      message: 'Ваш соперник отклонил ваше предложение ничьей.',
    });
  }

  console.log(`[DRAW] Ничья отклонена в игре ${gameId}.`);
  delete game.drawOfferedBy; // Сбрасываем предложение ничьей
});

  };