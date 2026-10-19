const { Chess } = require('chess.js');
module.exports = (io, socket, games) => {
  socket.on('createGame', ({ id, time }) => {
    const userId = socket.data.userId; // id из проверенных данных Telegram
    const initialTime = time * 60;
    
    // Проверяем, есть ли игра с этим пользователем
    const existingGame = Object.values(games).find(
      (game) =>
        game.players.length === 1 && game.players[0].userId === userId && !game.isStarted
    );

    if (existingGame) {
      socket.emit('errorMessage', {
        message: 'You already have a pending game. Join that game instead.',
      });
      return;
    }
    
    if (!id || games[id]) {
      socket.emit('errorMessage', { message: 'Invalid game id.' });
      return;
    }

    games[id] = {
      players: [{ id: socket.id, userId }],
      colors: { [socket.id]: 'white' },
      isStarted: false,
      game: new Chess(),
      time,
      timeLeft: { white: initialTime, black: initialTime },
      currentTurn: 'white',
      lastMoveTime: Date.now(),
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

socket.on('findRandomGame', ({ time }) => {
  const userId = socket.data.userId; // id из проверенных данных Telegram
  // Ищем подходящую игру для подключения
  const waitingGameId = Object.keys(games).find(
    (gameId) =>
      !games[gameId].isStarted &&
      games[gameId].players.length === 1 &&
      games[gameId].time === time &&
      games[gameId].players[0].userId !== userId // Пропускаем игры с тем же userId
  );

  if (waitingGameId) {
    // Игра найдена, добавляем игрока
    const gameId = waitingGameId;
    const game = games[gameId];

    game.players.push({ id: socket.id, userId });
    game.colors[socket.id] = 'black';
    game.isStarted = true;
    game.lastMoveTime = Date.now();
    game.currentTurn = 'white'; // Игра начинается с хода белых
    socket.join(gameId);

    // Уведомляем игроков об их цветах
    io.to(game.players[0].id).emit('assignColor', { color: 'white' });
    io.to(game.players[1].id).emit('assignColor', { color: 'black' });
    io.to(gameId).emit('playerJoined', { gameId, timeLeft: game.timeLeft });

    console.log(`Игрок ${userId} присоединился к случайной игре: ${gameId}`);
  } else {
    // Если подходящей игры нет, создаем новую
    const newGameId = `game_${Math.random().toString(36).substr(2, 9)}`;
    games[newGameId] = {
      players: [{ id: socket.id, userId }],
      colors: { [socket.id]: 'white' },
      isStarted: false,
      game: new Chess(),
      time,
      timeLeft: { white: time * 60, black: time * 60 },
      lastMoveTime: Date.now(),
    };
    socket.join(newGameId);
    socket.emit('startGame', {
      gameId: newGameId,
      color: 'white',
      timeLeft: games[newGameId].timeLeft,
    });

    console.log(`Случайная игра создана: ${newGameId} для пользователя ${userId} с временем ${time} минут`);
  }
});


  socket.on('joinGame', ({ gameId }) => {
    const userId = socket.data.userId; // id из проверенных данных Telegram
    const game = games[gameId];
    if (!game) {
      socket.emit('errorMessage', { message: 'Game not found.' });

      return;
    }
    // Проверяем, чтобы игроки не имели одинаковый userId
    const existingPlayer = game.players.find((player) => player.userId === userId);
    if (existingPlayer) {
      socket.emit('errorMessage', {
        message: 'You cannot join the game against yourself.',
      });
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
    } else {
      socket.emit('errorMessage', { message: 'The game is already full.' });
    }
  });
};
