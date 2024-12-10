module.exports = (io, socket, games) => {
  const handlePlayerDisconnection = (gameId, socketId) => {
    const game = games[gameId];
    if (!game) return;

    const disconnectedPlayer = game.players.find(player => player.id === socketId);
    game.players = game.players.filter(player => player.id !== socketId);

    if (game.players.length === 0) {
      clearInterval(game.timerInterval); // Останавливаем таймер
      delete games[gameId];
      console.log(`Игра ${gameId} завершена и удалена, так как в ней нет игроков.`);
    } else {
      const remainingPlayer = game.players[0];
      const remainingColor = game.colors[remainingPlayer.id] === 'white' ? 'Белые' : 'Черные';

      console.log(`[DISCONNECT] Игрок ${remainingPlayer.userId || remainingPlayer.id} остался в игре ${gameId}.`);

      // Сообщаем оставшемуся игроку о начале отсчета
      io.to(remainingPlayer.id).emit('opponentDisconnected', { timeout: 10 });

      if (!game.disconnectTimeout) {
        game.disconnectTimeout = setTimeout(() => {
          if (games[gameId] && games[gameId].players.length === 1) {
            io.to(remainingPlayer.id).emit('gameEnded', {
              message: `Победа: ${remainingColor}. Ваш противник не вернулся в игру.`,
            });
            console.log(`[GAME ENDED] Победа: ${remainingColor}. Игра ${gameId} завершена из-за отсутствия противника.`);

            clearInterval(game.timerInterval); // Останавливаем таймер
            delete games[gameId];
          }
        }, 10000);
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
  socket.on('leaveGame', ({ gameId, userId }) => {
    const game = games[gameId];
    if (!game) return;

    const leavingPlayer = game.players.find(player => player.userId === userId);
    if (!leavingPlayer) return;

    console.log(`Игрок ${userId} покинул игру ${gameId}`);
    handlePlayerDisconnection(gameId, leavingPlayer.id);
  });
};
