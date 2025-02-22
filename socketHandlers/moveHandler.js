const { Chess } = require('chess.js');
const db = require('../db'); // Подключение к базе данных

module.exports = (io, socket, games) => {
  socket.on('move', async ({ gameId, move }) => {
    console.log(`[SERVER] Received move:`, move, `for game: ${gameId}`);
    const game = games[gameId];
    if (!game) {
      socket.emit('error', { message: 'Game not found.' });
      return;
    }

    const currentPlayer = game.players.find((player) => player.id === socket.id);
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
        // Сохранение результатов игры в базу данных
        await saveGameResult({
          player1Id: game.players[0].userId, // Исправлено с telegram_id на userId
          player2Id: game.players[1].userId, // Исправлено
          winnerId, 
          gameFEN: game.game.fen(),
        });

        // Обновление рейтинга игроков
        await updateRatings(game.players[0].userId, game.players[1].userId, winnerId); // Исправлено


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

  const opponent = game.players.find(player => player.id !== socket.id);
  if (!opponent) {
    socket.emit('errorMessage', { message: 'No opponent for a rematch.' });
    return;
  }

  io.to(opponent.id).emit('rematchRequested', { message: 'Your opponent wants a rematch. Accept?' });
});

socket.on('acceptRematch', ({ gameId }) => {
  const game = games[gameId];
  if (!game) {
    socket.emit('errorMessage', { message: 'Game not found for a rematch.' });
    return;
  }

  const newGameId = `game_${Math.random().toString(36).substr(2, 9)}`;
  const initialTime = game.time;

  games[newGameId] = {
    players: game.players,
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


// Функция сохранения результата игры
async function saveGameResult({ player1Id, player2Id, winnerId, gameFEN }) {
  const result = winnerId ? 'win' : 'draw';
  try {
    await db.query(
      `INSERT INTO games (player_1_id, player_2_id, winner_id, result, game_fen)
       VALUES ($1, $2, $3, $4, $5)`,
      [player1Id, player2Id, winnerId, result, gameFEN]
    );
    console.log('Результат игры успешно сохранён в базе данных.');
  } catch (err) {
    console.error('Ошибка сохранения результата игры:', err.message);
  }
}

// Функция обновления рейтингов игроков
async function updateRatings(player1Id, player2Id, winnerId) {
  try {

    console.log(player1Id)
    console.log(player2Id)
    // Получаем текущие рейтинги игроков
    const { rows: player1Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player1Id]);
    const { rows: player2Data } = await db.query(`SELECT rating FROM ratings WHERE user_id = $1`, [player2Id]);

    if (!player1Data.length || !player2Data.length) {
      console.error(`[SERVER] Один из пользователей не найден в таблице рейтингов.`);
      return;
    }

    const player1Rating = player1Data[0].rating;
    const player2Rating = player2Data[0].rating;

    console.log(`[SERVER] Текущие рейтинги: Player 1: ${player1Rating}, Player 2: ${player2Rating}`);

    // Рассчитываем изменение рейтинга
    const kFactor = 32;
    const expectedScore1 = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
    const expectedScore2 = 1 / (1 + Math.pow(10, (player1Rating - player2Rating) / 400));

    let score1, score2;
    if (winnerId === player1Id) {
      score1 = 1; // Победа
      score2 = 0; // Проигрыш
    } else if (winnerId === player2Id) {
      score1 = 0; // Проигрыш
      score2 = 1; // Победа
    } else {
      score1 = 0.5; // Ничья
      score2 = 0.5; // Ничья
    }

    const newPlayer1Rating = Math.round(player1Rating + kFactor * (score1 - expectedScore1));
    const newPlayer2Rating = Math.round(player2Rating + kFactor * (score2 - expectedScore2));

    console.log(`[SERVER] Новые рейтинги: Player 1: ${newPlayer1Rating}, Player 2: ${newPlayer2Rating}`);

    // Обновляем рейтинги в базе данных
    await db.query(`UPDATE ratings SET rating = $1 WHERE user_id = $2`, [newPlayer1Rating, player1Id]);
    await db.query(`UPDATE ratings SET rating = $1 WHERE user_id = $2`, [newPlayer2Rating, player2Id]);

    console.log(`[SERVER] Рейтинги успешно обновлены.`);
  } catch (err) {
    console.error(`[SERVER] Ошибка при обновлении рейтингов: ${err.message}`);
  }
}
