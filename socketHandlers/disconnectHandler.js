const { finishGame } = require('../gameResult');
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
      game.isOver = true; // Игроков не осталось — таймер больше не тикает
      setTimeout(() => {
        if (games[gameId]) {
          console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
          delete games[gameId];
        }
      }, 100000); // 100 секунд задержки перед удалением старой игры

      console.log(`Игра ${gameId} завершена и удалена, так как в ней нет игроков.`);
    } else if (remainingPlayer && !game.isOver && game.isStarted) {
      io.to(remainingPlayer.id).emit('opponentDisconnected', { timeout: 10 });

      if (!game.disconnectTimeout) {
        game.disconnectTimeout = setTimeout(async () => {
          game.disconnectTimeout = null;
          if (games[gameId] && games[gameId].players.length === 1 && !game.isOver) {
            io.to(remainingPlayer.id).emit('gameEnded', {
              message: `Victory: ${remainingColor}. Your opponent did not return to the game.`,
            });

            console.log(`[GAME ENDED] Победа: ${remainingColor}. Игра ${gameId} завершена из-за отсутствия противника.`);

            // Сохраняем победу оставшегося игрока и обновляем рейтинги (ровно один раз)
            await finishGame(game, {
              player1Id: remainingPlayer.userId,
              player2Id: disconnectedPlayer?.userId,
              winnerId: remainingPlayer.userId,
            });

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

    // Игрок может числиться и в старой партии, и в реванше — обрабатываем все
    for (let gameId in games) {
      if (games[gameId].players.some(player => player.id === socket.id)) {
        handlePlayerDisconnection(gameId, socket.id);
      }
    }
  });

  // Обработка выхода игрока из игры
  socket.on('leaveGame', async ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    // Выйти можно только за себя: игрока ищем по сокету, а не по присланному userId
    const leavingPlayer = game.players.find(player => player.id === socket.id);
    const remainingPlayer = game.players.find(player => player.id !== socket.id);
    if (!leavingPlayer) return;

    console.log(`Игрок ${leavingPlayer.userId} покинул игру ${gameId}`);

    // Выход из идущей партии — поражение
    if (remainingPlayer && game.isStarted && !game.isOver) {
      const remainingColor = game.colors[remainingPlayer.id] === 'white' ? 'White' : 'Black';
      io.to(remainingPlayer.id).emit('gameEnded', {
        message: `Victory: ${remainingColor}. Your opponent left the game.`,
      });

      await finishGame(game, {
        player1Id: remainingPlayer.userId,
        player2Id: leavingPlayer.userId,
        winnerId: remainingPlayer.userId,
      });
    }

    socket.leave(gameId);
    handlePlayerDisconnection(gameId, leavingPlayer.id);
  });
};
