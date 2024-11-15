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
      lastMoveTime: Date.now()
    };
    socket.join(id);
    socket.emit('startGame', {
      gameId: id,
      color: 'white',
      currentTurn: games[id].currentTurn,
      timeLeft: games[id].timeLeft
    });

    // socket.emit('startGame', { gameId: id, color: 'white' });
    console.log(`Игра ${id} создана: игрок ${userId} (ID сокета: ${socket.id}) присоединился с цветом white`);
  });

  socket.on('findRandomGame', ({ time, userId }) => {
    console.log(`Параметры случайной игры: время - ${time} минут, userId - ${userId}`);
    const waitingGameId = Object.keys(games).find(gameId => 
      !games[gameId].isStarted &&
      games[gameId].players.length === 1 &&
      games[gameId].time === time
    );

    if (waitingGameId) {
      const gameId = waitingGameId;
      games[gameId].players.push({ id: socket.id, userId });
      games[gameId].colors[socket.id] = 'black';
      games[gameId].isStarted = true;
      games[gameId].timeLeft = { white: games[gameId].time * 60, black: games[gameId].time * 60 };
      socket.join(gameId);

      const gameTime = games[gameId].time * 60; // Преобразуем минуты в секунды

      io.to(games[gameId].players[0].id).emit('assignColor', { color: 'white' });
      io.to(games[gameId].players[1].id).emit('assignColor', { color: 'black' });
      io.to(gameId).emit('playerJoined', { gameId, gameTime, timeLeft: games[gameId].timeLeft });

      console.log(`Игрок ${userId} присоединился к случайной игре: ${gameId}`);
    } else {
      const newGameId = `game_${Math.random().toString(36).substr(2, 9)}`;
      games[newGameId] = {
        players: [{ id: socket.id, userId }],
        colors: { [socket.id]: 'white' },
        isStarted: false,
        game: new Chess(),
        time,
        timeLeft: { white: time * 60, black: time * 60 },
        lastMoveTime: Date.now()
      };
      socket.join(newGameId);
      socket.emit('startGame', { gameId: newGameId, color: 'white', timeLeft: games[newGameId].timeLeft });
      console.log(`Случайная игра создана: ${newGameId} для пользователя ${userId} с временем ${time} минут`);
    }
  });

  socket.on('joinGame', ({ gameId, userId }) => {
    console.log(`Запрос на подключение к игре с ID: ${gameId} от игрока ${socket.id}`);
    if (games[gameId]) {
      const game = games[gameId];
      if (game.players.length === 1) {
        // Добавляем второго игрока
        game.players.push({ id: socket.id, userId });
        socket.join(gameId);
        game.isStarted = true;

        // Присваиваем цвет второму игроку
        game.colors[socket.id] = 'black';

        const player1 = game.players[0];
        const player2 = game.players[1];

        // Уведомляем каждого игрока об оппоненте
        io.to(player1.id).emit('opponentInfo', { opponentId: player2.userId });
        io.to(player2.id).emit('opponentInfo', { opponentId: player1.userId });

        // Уведомляем о старте игры и текущем ходе
        io.to(player1.id).emit('assignColor', { color: 'white' });
        io.to(player2.id).emit('assignColor', { color: 'black' });
        io.to(gameId).emit('playerJoined', {
          gameId,
          currentTurn: game.currentTurn,
          timeLeft: game.timeLeft
        });

        console.log(`Игрок ${socket.id} присоединился к игре: ${gameId}`);
      } else {
        socket.emit('errorMessage', { message: 'Игра уже заполнена' });
        console.log(`Ошибка: Игра ${gameId} уже заполнена`);
      }
    } else {
      socket.emit('errorMessage', { message: 'Игра не найдена' });
      console.log(`Ошибка: игра ${gameId} не найдена`);
    }
  });

};
