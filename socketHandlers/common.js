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
};
