const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const telegramAvatarRouter = require('./telegramAvatar'); 

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use('/api', telegramAvatarRouter);

const games = {}; // Глобальный объект для хранения данных об играх

// Импорт обработчиков событий
const handleGameEvents = require('./socketHandlers/gameHandler');
const handleMoveEvents = require('./socketHandlers/moveHandler');
const handleDisconnectEvents = require('./socketHandlers/disconnectHandler');
const handleCommonEvents = require('./socketHandlers/common');

// Устанавливаем обработчики событий сокета
io.on('connection', (socket) => {
  console.log('Новый клиент подключен:', socket.id);

  handleGameEvents(io, socket, games);
  handleMoveEvents(io, socket, games);
  handleDisconnectEvents(io, socket, games);
  handleCommonEvents(io, socket, games);
});

setInterval(() => {
  Object.keys(games).forEach((gameId) => {
    const game = games[gameId];

    // Лог текущего состояния игры
    console.log(`[TIMER] Checking game: ${gameId}`);
    console.log(`[TIMER] Game state:`, {
      isStarted: game?.isStarted,
      currentTurn: game?.currentTurn,
      timeLeft: game?.timeLeft,
      isGameOver: game?.game?.isGameOver?.(),
    });

    // Проверяем, активна ли игра
    if (!game || !game.isStarted || !game.currentTurn || game.game.isGameOver()) {
      console.log(`[TIMER] Game ${gameId} is not active or already finished. Skipping.`);
      return;
    }

    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - game.lastMoveTime) / 1000);

    if (elapsedTime > 0) {
      const currentColor = game.currentTurn;

      console.log(`[TIMER] Current Turn: ${currentColor}`);
      console.log(`[TIMER] Elapsed Time: ${elapsedTime}`);
      console.log(`[TIMER] Time Left Before Update:`, game.timeLeft);

      game.timeLeft[currentColor] -= elapsedTime;

      // Проверяем, истекло ли время у текущего игрока
      if (game.timeLeft[currentColor] <= 0) {
        const winner = currentColor === 'white' ? 'black' : 'white';

        console.log(`[TIMER] Player ${currentColor}'s time expired. Declaring winner: ${winner}.`);

        io.to(gameId).emit('gameEnded', {
          message: `Время игрока ${currentColor} истекло. Победитель: ${winner}!`,
        });

        console.log(`[TIMER] Game ${gameId} ended. Deleting from active games.`);
        delete games[gameId];
        return;
      }

      // Обновляем lastMoveTime
      game.lastMoveTime = currentTime;

      console.log(`[TIMER] Time Left After Update:`, game.timeLeft);

      // Отправляем обновление времени только для активных игр
      io.to(gameId).emit('syncTime', { timeLeft: game.timeLeft });
    }
  });
}, 1000);





const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));


