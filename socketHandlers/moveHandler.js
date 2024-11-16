module.exports = (io, socket, games) => {
socket.on('makeMove', ({ gameId, fromRow, fromCol, toRow, toCol }) => {
  const game = games[gameId];
  if (!game || !game.timeLeft) return;

  const currentColor = game.game.turn() === 'w' ? 'white' : 'black';
  if (currentColor !== game.colors[socket.id]) {
    socket.emit('errorMessage', { message: 'Сейчас не ваш ход' });
    return;
  }

  const move = {
    from: `${String.fromCharCode(97 + fromCol)}${8 - fromRow}`,
    to: `${String.fromCharCode(97 + toCol)}${8 - toRow}`
  };

  try {
    const chessMove = game.game.move(move);
    if (!chessMove) {
      socket.emit('errorMessage', { message: 'Недопустимый ход' });
      return;
    }

    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - game.lastMoveTime) / 1000);
    game.timeLeft[currentColor] -= elapsedTime;

    if (game.timeLeft[currentColor] <= 0) {
      const winner = currentColor === 'white' ? 'black' : 'white';
      io.to(gameId).emit('gameEnded', {
        message: `Время игрока ${currentColor} истекло. Победитель: ${winner}!`
      });
      delete games[gameId];
      return;
    }

    game.lastMoveTime = currentTime;
    game.currentTurn = currentColor === 'white' ? 'black' : 'white';

    const newBoard = game.game.board();
    io.to(game.players[0].id).emit('updateBoard', {
      gameId,
      board: newBoard,
      currentTurn: game.currentTurn,
      timeLeft: game.timeLeft
    });
    io.to(game.players[1].id).emit('updateBoard', {
      gameId,
      board: newBoard,
      currentTurn: game.currentTurn,
      timeLeft: game.timeLeft
    });

  } catch (error) {
    socket.emit('errorMessage', { message: `Ошибка: ${error.message}` });
  }
});
};
