module.exports = (io, socket, games) => {
  // Обработка отключения игрока
  socket.on('disconnect', () => {
    console.log('Клиент отключен:', socket.id);

    for (let gameId in games) {
      const game = games[gameId];

      // Проверяем, есть ли игрок в этой игре
      if (game.players.some(player => player.id === socket.id)) {
        // Удаляем игрока из списка
        game.players = game.players.filter(player => player.id !== socket.id);

        // Если игроков больше нет, удаляем игру
        if (game.players.length === 0) {
          clearInterval(game.timerInterval); // Останавливаем таймер
          delete games[gameId];
          console.log(`Игра ${gameId} завершена и удалена, так как в ней нет игроков.`);
        } else {
          // Отправляем уведомление оставшемуся игроку
          const remainingPlayer = game.players[0];
          io.to(remainingPlayer.id).emit('opponentDisconnected', { message: 'Ваш противник отключился. Игра завершена.' });

          // Если второй игрок не вернется через 5 секунд, завершаем игру
          if (!game.disconnectTimeout) {
            game.disconnectTimeout = setTimeout(() => {
              if (games[gameId] && games[gameId].players.length === 1) {
                io.to(remainingPlayer.id).emit('gameEnded', { message: 'Ваш противник не вернулся, игра завершена.' });
                clearInterval(game.timerInterval); // Останавливаем таймер
                delete games[gameId];
                console.log(`Игра ${gameId} завершена и удалена из-за отключения одного из игроков.`);
              }
            }, 5000);
          }
        }
        break;
      }
    }
  });

  // Обработка выхода игрока из игры
  socket.on('leaveGame', ({ gameId, userId }) => {
    const game = games[gameId];
    if (!game) return;

    // Удаляем игрока из списка
    game.players = game.players.filter(player => player.userId !== userId);
    console.log(`Игрок ${userId} покинул игру ${gameId}`);

    if (game.players.length === 0) {
      // Если игроков больше нет, удаляем игру
      clearInterval(game.timerInterval); // Останавливаем таймер
      delete games[gameId];
      console.log(`Игра ${gameId} удалена, так как в ней больше нет игроков.`);
    } else {
      // Уведомляем оставшегося игрока о победе
      const remainingPlayer = game.players[0];
      io.to(remainingPlayer.id).emit('gameEnded', { 
        message: 'Ваш противник покинул игру. Вы победили!' 
      });

      // Немедленно завершаем игру
      clearInterval(game.timerInterval); // Останавливаем таймер
      delete games[gameId];
      console.log(`Игра ${gameId} завершена, так как противник покинул игру.`);
    }
  });
};
