module.exports = (io, socket, games) => {
  // Обработка отключения игрока
  socket.on('disconnect', () => {
    console.log('Клиент отключен:', socket.id);

    for (let gameId in games) {
      if (games[gameId].players.includes(socket.id)) {
        games[gameId].players = games[gameId].players.filter(id => id !== socket.id);

        if (games[gameId].players.length === 0) {
          delete games[gameId];
          console.log(`Игра ${gameId} завершена и удалена, так как в ней нет игроков.`);
        } else {
          // Отправляем уведомление оставшемуся игроку
          const remainingPlayerId = games[gameId].players[0];
          io.to(remainingPlayerId).emit('opponentDisconnected', { message: 'Ваш противник отключился. Игра завершена.' });

          // Ждем 5 секунд перед завершением игры, если второй игрок не подключится снова
          games[gameId].disconnectTimeout = setTimeout(() => {
            if (games[gameId] && games[gameId].players.length === 1) {
              io.to(remainingPlayerId).emit('gameEnded', { message: 'Ваш противник не вернулся, игра завершена.' });
              delete games[gameId];
              console.log(`Игра ${gameId} завершена и удалена из-за отключения одного из игроков.`);
            }
          }, 5000);
        }
        break;
      }
    }
  });

socket.on('leaveGame', ({ gameId, userId }) => {
  if (games[gameId]) {
    // Находим игрока по userId и удаляем его
    games[gameId].players = games[gameId].players.filter(player => player.userId !== userId);
    console.log(`Игрок ${userId} покинул игру ${gameId}`);
    
    // Проверка количества оставшихся игроков
    if (games[gameId].players.length === 0) {
      delete games[gameId];
      console.log(`Игра ${gameId} удалена, так как в ней больше нет игроков.`);
    } else {
      // Если остался другой игрок, уведомляем его
      const remainingPlayer = games[gameId].players[0];
      io.to(remainingPlayer.id).emit('opponentDisconnected', { message: 'Ваш противник покинул игру.' });
    }
  }
});



};
