const crypto = require('crypto');

// Сколько живут данные запуска Mini App (initData), секунды
const MAX_AGE_SECONDS = Number(process.env.INIT_DATA_MAX_AGE) || 24 * 60 * 60;

// Проверка подписи initData по документации Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Возвращает объект пользователя Telegram или null, если данные поддельные или устарели.
function verifyInitData(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!initData || typeof initData !== 'string' || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user'));
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

// Express middleware: проверяет заголовок X-Telegram-Init-Data и кладёт пользователя в req.tgUser
function requireTelegramUser(req, res, next) {
  const user = verifyInitData(req.get('X-Telegram-Init-Data'));
  if (!user) {
    return res.status(401).json({ message: 'Неверные данные авторизации Telegram.' });
  }
  req.tgUser = user;
  next();
}

// Socket.IO middleware: проверяет socket.handshake.auth.initData и кладёт id пользователя в socket.data.userId
function socketAuth(socket, next) {
  const user = verifyInitData(socket.handshake.auth?.initData);
  if (!user) {
    return next(new Error('unauthorized'));
  }
  socket.data.userId = user.id;
  next();
}

module.exports = { verifyInitData, requireTelegramUser, socketAuth };
