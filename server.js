require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const telegramAvatarRouter = require('./telegramAvatar'); 
const userRouter = require('./userHandler');
const db = require('./db'); // Подключение к базе данных

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use('/api', telegramAvatarRouter);
app.use('/api/users', userRouter); 

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
  Object.keys(games).forEach(async (gameId) => {
    const game = games[gameId];

    if (!game || !game.isStarted || !game.currentTurn || game.game.isGameOver()) {
      console.log(`[TIMER] Game ${gameId} is not active or already finished. Skipping.`);
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

        // Сохраняем результаты в базу данных
        await saveGameResult({
          player1Id: game.players[0].userId,
          player2Id: game.players[1].userId,
          winnerId,
          gameFEN: game.game.fen(),
        });

        // Обновляем рейтинги
        await updateRatings(game.players[0].userId, game.players[1].userId, winnerId);
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


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));


