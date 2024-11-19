module.exports = (io, socket, games) => {
  // Очистка таймера при повторном подключении второго игрока
  socket.on('rejoinGame', (gameId) => {
    if (games[gameId] && games[gameId].disconnectTimeout) {
      clearTimeout(games[gameId].disconnectTimeout);
      games[gameId].disconnectTimeout = null;
      console.log(`Игрок снова подключился к игре ${gameId}, таймер завершения игры остановлен.`);
      io.to(gameId).emit('playerRejoined', { message: 'Ваш противник снова подключился.' });
    }
  });

  // Событие для отправки информации о сопернике по запросу
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

  const message = `${surrenderingPlayer.userId || 'Игрок'} сдался. Победитель: ${opponentPlayer?.userId || 'Противник'}.`;
  
  io.to(gameId).emit('gameEnded', { message });

  console.log(`[SURRENDER] Игрок ${surrenderingPlayer.userId} сдался в игре ${gameId}.`);
  
  setTimeout(() => {
    delete games[gameId];
  }, 3000); // Удаляем игру через 3 секунды
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

  io.to(gameId).emit('gameEnded', {
    message: 'Игра завершена. Результат: ничья.',
  });

  console.log(`[DRAW] Ничья принята в игре ${gameId}.`);
  delete games[gameId];
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