const { Chess } = require('chess.js');

module.exports = (io, socket, games) => {
  socket.on('createGame', ({ id, time, userId }) => {
    const initialTime = time * 60;
    games[id] = {
      players: [{ id: socket.id, userId }],
      colors: { [socket.id]: 'white' },
      isStarted: false,
      game: new Chess(),
      time,
      timeLeft: { white: initialTime, black: initialTime },
      currentTurn: 'white',
      lastMoveTime: Date.now(),
      timerInterval: null, // Таймер игры
    };
    socket.join(id);
    socket.emit('startGame', {
      gameId: id,
      color: 'white',
      currentTurn: games[id].currentTurn,
      timeLeft: games[id].timeLeft,
    });

    console.log(`Игра ${id} создана: игрок ${userId} (ID сокета: ${socket.id}) присоединился с цветом white`);
  });

  socket.on('findRandomGame', ({ time, userId }) => {
    const waitingGameId = Object.keys(games).find(
      gameId =>
        !games[gameId].isStarted &&
        games[gameId].players.length === 1 &&
        games[gameId].time === time
    );

    if (waitingGameId) {
      const gameId = waitingGameId;
      const game = games[gameId];

      game.players.push({ id: socket.id, userId });
      game.colors[socket.id] = 'black';
      game.isStarted = true;
      game.lastMoveTime = Date.now();
      game.currentTurn = 'white'; // Игра начинается с хода белых
      socket.join(gameId);

      io.to(game.players[0].id).emit('assignColor', { color: 'white' });
      io.to(game.players[1].id).emit('assignColor', { color: 'black' });
      io.to(gameId).emit('playerJoined', { gameId, timeLeft: game.timeLeft });

      console.log(`Игрок ${userId} присоединился к случайной игре: ${gameId}`);

      startGameTimer(io, gameId, game);
    } else {
      const newGameId = `game_${Math.random().toString(36).substr(2, 9)}`;
      games[newGameId] = {
        players: [{ id: socket.id, userId }],
        colors: { [socket.id]: 'white' },
        isStarted: false,
        game: new Chess(),
        time,
        timeLeft: { white: time * 60, black: time * 60 },
        lastMoveTime: Date.now(),
        timerInterval: null,
      };
      socket.join(newGameId);
      socket.emit('startGame', { gameId: newGameId, color: 'white', timeLeft: games[newGameId].timeLeft });
      console.log(`Случайная игра создана: ${newGameId} для пользователя ${userId} с временем ${time} минут`);
    }
  });

  socket.on('joinGame', ({ gameId, userId }) => {
    const game = games[gameId];
    if (!game) {
      socket.emit('errorMessage', { message: 'Игра не найдена' });
      return;
    }

    if (game.players.length === 1) {
      game.players.push({ id: socket.id, userId });
      socket.join(gameId);
      game.isStarted = true;
      game.colors[socket.id] = 'black';

      const player1 = game.players[0];
      const player2 = game.players[1];

      io.to(player1.id).emit('opponentInfo', { opponentId: player2.userId });
      io.to(player2.id).emit('opponentInfo', { opponentId: player1.userId });

      game.lastMoveTime = Date.now(); // Устанавливаем время старта игры

      io.to(player1.id).emit('assignColor', { color: 'white' });
      io.to(player2.id).emit('assignColor', { color: 'black' });
      io.to(gameId).emit('playerJoined', {
        gameId,
        currentTurn: game.currentTurn,
        timeLeft: game.timeLeft,
      });

      startGameTimer(io, gameId, game);
    } else {
      socket.emit('errorMessage', { message: 'Игра уже заполнена' });
    }
  });

const startGameTimer = (io, gameId, game) => {
  // Останавливаем существующий таймер, если он есть
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
    console.log(`[SERVER] Старый таймер для игры ${gameId} остановлен.`);
  }

  game.timerInterval = setInterval(() => {
    if (!game.isStarted || game.game.isGameOver()) {
      console.log(`[TIMER] Игра ${gameId} завершена или не началась. Останавливаем таймер.`);
      clearInterval(game.timerInterval);
      game.timerInterval = null;
      return;
    }

    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - game.lastMoveTime) / 1000);
    const currentColor = game.currentTurn;

    if (elapsedTime > 0) {
      game.timeLeft[currentColor] -= elapsedTime;

      if (game.timeLeft[currentColor] <= 0) {
        const winner = currentColor === 'white' ? 'black' : 'white';
        io.to(gameId).emit('gameEnded', {
          message: `Время игрока ${currentColor} истекло. Победитель: ${winner}!`,
        });
        clearInterval(game.timerInterval);
        delete games[gameId];
        return;
      }

      game.lastMoveTime = currentTime;
      io.to(gameId).emit('syncTime', { timeLeft: game.timeLeft });
    }
  }, 1000);

  console.log(`[TIMER] Таймер запущен для игры ${gameId}`);
};


};