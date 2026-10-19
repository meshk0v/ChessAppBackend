require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const telegramAvatarRouter = require('./telegramAvatar'); 
const userRouter = require('./userHandler');
const { socketAuth } = require('./auth');
const { finishGame } = require('./gameResult');

// Домены фронтенда, которым разрешены запросы (через запятую)
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://chess-battle.space')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: allowedOrigins, methods: ["GET", "POST"] } });

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use('/api', telegramAvatarRouter);
app.use('/api/users', userRouter); 

const games = {}; // Глобальный объект для хранения данных об играх

// Импорт обработчиков событий
const handleGameEvents = require('./socketHandlers/gameHandler');
const handleMoveEvents = require('./socketHandlers/moveHandler');
const handleDisconnectEvents = require('./socketHandlers/disconnectHandler');
const handleCommonEvents = require('./socketHandlers/common');

// Пускаем только пользователей с подписанными данными Telegram
io.use(socketAuth);

// Устанавливаем обработчики событий сокета
io.on('connection', (socket) => {
  console.log('Новый клиент подключен:', socket.id);

  handleGameEvents(io, socket, games);
  handleMoveEvents(io, socket, games);
  handleDisconnectEvents(io, socket, games);
  handleCommonEvents(io, socket, games);
});

setInterval(() => {
  Object.keys(games).forEach(async (gameId) => {
    const game = games[gameId];

    if (!game || game.isOver || !game.isStarted || !game.currentTurn || game.game.isGameOver()) {
      return;
    }

    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - game.lastMoveTime) / 1000);

    if (elapsedTime > 0) {
      const currentColor = game.currentTurn;

      game.timeLeft[currentColor] -= elapsedTime;

      // Проверяем, истекло ли время у текущего игрока
      if (game.timeLeft[currentColor] <= 0) {
        const winnerColor = currentColor === 'white' ? 'black' : 'white';
        const winnerId = game.players.find((p) => game.colors[p.id] === winnerColor)?.userId || null;
        const loserId = game.players.find((p) => game.colors[p.id] !== winnerColor)?.userId || null;

        io.to(gameId).emit('gameEnded', {
          gameId,
          board: game.game.fen(),
          gameOver: true,
          message: `Player ${currentColor}'s time has run out. Winner: ${winnerColor === 'white' ? 'White' : 'Black'}!`,
        });

        console.log(`[SERVER] Game over due to timeout. Winner: ${winnerId}, Loser: ${loserId}`);

        // Сохраняем результат и обновляем рейтинги (ровно один раз)
        await finishGame(game, {
          player1Id: game.players[0]?.userId,
          player2Id: game.players[1]?.userId,
          winnerId,
        });

        setTimeout(() => {
          if (games[gameId]) {
            console.log(`[SERVER] Deleting game with ID: ${gameId}`);
            delete games[gameId];
          }
        }, 100000); // 100 секунд задержки

        return;
      }

      // Обновляем lastMoveTime
      game.lastMoveTime = currentTime;

      // Отправляем обновление времени только для активных игр
      io.to(gameId).emit('syncTime', { timeLeft: game.timeLeft });
    }
  });
}, 1000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));


