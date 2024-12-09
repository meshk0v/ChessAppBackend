const { Chess } = require('chess.js');

module.exports = (io, socket, games) => {
socket.on('move', ({ gameId, move }) => {
  console.log(`[SERVER] Received move:`, move, `for game: ${gameId}`);
  const game = games[gameId];
  if (!game) {
    socket.emit('error', { message: 'Игра не найдена.' });
    console.log(`[SERVER] Game not found: ${gameId}`);
    return;
  }

  const currentPlayer = game.players.find((player) => player.id === socket.id);
  const currentColor = game.colors[socket.id];

  console.log(`[SERVER] Current turn: ${game.currentTurn}, Player color: ${currentColor}`);

  if (game.currentTurn !== currentColor) {
    socket.emit('error', { message: 'Сейчас не ваш ход.' });
    console.log(`[SERVER] Not this player's turn. Move rejected.`);
    return;
  }

  try {
    const result = game.game.move(move); // Поддержка промоции через move.promotion
    if (!result) {
      socket.emit('error', { message: 'Неверный ход.' });
      console.log(`[SERVER] Invalid move:`, move);
      return;
    }

    // Если была захвачена фигура, добавляем её в `result.captured`
    const capturedPiece = result.captured ? `${result.color}${result.captured.toUpperCase()}` : null;

    // Отправляем обновление клиенту
    io.to(gameId).emit('updateBoard', {
      board: game.game.fen(),
      currentTurn: game.currentTurn,
      move,
      capturedPiece, // Передаём захваченную фигуру
      gameOver: false,
    });

    console.log(`[SERVER] Move successful:`, result);

    // Обновление текущего хода и времени
    game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
    game.lastMoveTime = Date.now();

    // Проверка завершения игры
    if (game.game.isGameOver()) {
      const winner = game.currentTurn === 'white' ? 'Черные' : 'Белые';
      const message = game.game.isCheckmate()
        ? `Мат! Победитель: ${winner}`
        : 'Игра завершена.';

      // Отправка результата обеим сторонам
      io.to(gameId).emit('updateBoard', {
        gameId,
        board: game.game.fen(),
        currentTurn: game.currentTurn,
        move,
        gameOver: true,
        message,
      });

      console.log(`[SERVER] Game over. Message sent: ${message}`);
      delete games[gameId]; // Удаление игры после завершения
      return;
    }

    // Отправка обновлений для обоих игроков
    io.to(gameId).emit('updateBoard', {
      gameId,
      board: game.game.fen(),
      currentTurn: game.currentTurn,
      move,
      gameOver: false,
    });
  } catch (error) {
    console.error(`[SERVER] Error processing move: ${error.message}`);
    socket.emit('error', { message: 'Ошибка обработки хода: ' + error.message });
  }
});
};
