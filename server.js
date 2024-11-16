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
    if (!game.isStarted || !game.currentTurn) return;

    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - game.lastMoveTime) / 1000);

    // Обновляем только если прошло время
    if (elapsedTime > 0) {
      const currentColor = game.currentTurn;

      console.log('[TIMER] Current Turn:', currentColor);
      console.log('[TIMER] Elapsed Time:', elapsedTime);
      console.log('[TIMER] Time Left Before Update:', game.timeLeft);

      game.timeLeft[currentColor] -= elapsedTime;

      if (game.timeLeft[currentColor] <= 0) {
        const winner = currentColor === 'white' ? 'black' : 'white';
        io.to(gameId).emit('gameEnded', {
          message: `Время игрока ${currentColor} истекло. Победитель: ${winner}!`,
        });
        delete games[gameId];
        return;
      }

      // Обновляем lastMoveTime только после обновления времени
      game.lastMoveTime = currentTime;

      console.log('[TIMER] Time Left After Update:', game.timeLeft);

      io.to(gameId).emit('syncTime', { timeLeft: game.timeLeft });
    }
  });
}, 1000);




const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));


