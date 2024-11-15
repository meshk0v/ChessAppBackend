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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));


