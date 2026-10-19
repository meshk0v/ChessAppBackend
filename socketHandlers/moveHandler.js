const { Chess } = require('chess.js');
const { finishGame } = require('../gameResult');

module.exports = (io, socket, games) => {
  socket.on('move', async ({ gameId, move }) => {
    console.log(`[SERVER] Received move:`, move, `for game: ${gameId}`);
    const game = games[gameId];
    if (!game) {
      socket.emit('error', { message: 'Game not found.' });
      return;
    }

    if (game.isOver || !game.isStarted) {
      socket.emit('error', { message: 'The game is not active.' });
      return;
    }

    const currentColor = game.colors[socket.id];

    console.log(`[SERVER] Current turn: ${game.currentTurn}, Player color: ${currentColor}`);

    if (game.currentTurn !== currentColor) {
      socket.emit('error', { message: "It's not your turn right now." });
      console.log(`[SERVER] Not this player's turn. Move rejected.`);
      return;
    }

    try {
      const result = game.game.move(move); // Поддержка промоции через move.promotion
      if (!result) {
        socket.emit('error', { message: 'Invalid move.' });
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
        const isCheckmate = game.game.isCheckmate();
        const winnerColor = isCheckmate ? (game.currentTurn === 'white' ? 'black' : 'white') : null;
        console.log(winnerColor)
        // Определяем ID победителя и проигравшего
        const winnerId = winnerColor
          ? game.players.find((p) => game.colors[p.id] === winnerColor)?.userId
          : null;
        console.log(winnerId)
        const loserId = winnerColor
          ? game.players.find((p) => game.colors[p.id] !== winnerColor)?.userId
          : null;


        const resultMessage = isCheckmate
          ? `Winner: ${winnerColor === 'white' ? 'White' : 'Black'}`
          : 'The game ended in a draw.';

        
          io.to(gameId).emit('gameEnded', {
          gameId,
          board: game.game.fen(),
          gameOver: true,
          message: resultMessage,
        });
        // Сохраняем результат и обновляем рейтинги (ровно один раз)
        await finishGame(game, {
          player1Id: game.players[0]?.userId,
          player2Id: game.players[1]?.userId,
          winnerId,
        });

    // Удаляем игру, если реванш не был инициирован
    setTimeout(() => {
      if (games[gameId]) {
        console.log(`[SERVER] Deleting game with ID: ${gameId}`);
        delete games[gameId];
      }
    }, 100000); // Ждем немного перед удалением
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
      socket.emit('error', { message: 'Move processing error: ' + error.message });
    }
  });

socket.on('requestRematch', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    socket.emit('errorMessage', { message: 'Game not found for a rematch.' });
    return;
  }

  if (!game.players.some(player => player.id === socket.id)) {
    socket.emit('errorMessage', { message: 'You are not a player in this game.' });
    return;
  }

  const opponent = game.players.find(player => player.id !== socket.id);
  if (!opponent) {
    socket.emit('errorMessage', { message: 'No opponent for a rematch.' });
    return;
  }

  game.rematchRequestedBy = socket.id; // Запоминаем, кто попросил реванш
  io.to(opponent.id).emit('rematchRequested', { message: 'Your opponent wants a rematch. Accept?' });
});

socket.on('acceptRematch', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    socket.emit('errorMessage', { message: 'Game not found for a rematch.' });
    return;
  }

  // Принять реванш может только соперник того, кто его попросил, и только один раз
  const isPlayer = game.players.some(player => player.id === socket.id);
  if (!isPlayer || !game.rematchRequestedBy || game.rematchRequestedBy === socket.id || game.players.length !== 2) {
    socket.emit('errorMessage', { message: 'No rematch request to accept.' });
    return;
  }
  delete game.rematchRequestedBy;

  const newGameId = `game_${Math.random().toString(36).substr(2, 9)}`;
  const initialTime = game.time;

  games[newGameId] = {
    players: [...game.players], // Копия, чтобы старая и новая партии не делили один массив
    colors: { [game.players[0].id]: 'white', [game.players[1].id]: 'black' },
    isStarted: true,
    game: new Chess(),
    time: game.time,
    timeLeft: { white: initialTime * 60, black: initialTime * 60 },
    currentTurn: 'white',
    lastMoveTime: Date.now(),
  };

  setTimeout(() => {
    if (games[gameId]) {
      console.log(`[SERVER] Deleting old game with ID: ${gameId}`);
      delete games[gameId];
    }
  }, 100000); // 100 секунд задержки перед удалением старой игры


  // Обновляем комнаты игроков
  game.players.forEach(player => {
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.leave(gameId); // Удаляем из старой комнаты
      playerSocket.join(newGameId); // Добавляем в новую комнату
    }
  });

  // Уведомляем игроков о реванше
  game.players.forEach(player => {
    io.to(player.id).emit('rematchAccepted', {
      newGameId,
      color: games[newGameId].colors[player.id],
    });
  });

  console.log(`Реванш начался: ${newGameId}`);
});
};
