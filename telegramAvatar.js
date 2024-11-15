const express = require('express');
const axios = require('axios');
const path = require('path');
const router = express.Router();

const BOT_TOKEN = 'YOUR_BOT_TOKEN'; // Замените на токен вашего бота

router.get('/get_telegram_avatar/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${user_id}&limit=1`;
    const response = await axios.get(url);

    if (response.data.result && response.data.result.photos.length > 0) {
      const fileId = response.data.result.photos[0][0].file_id;
      const fileUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
      
      const fileResponse = await axios.get(fileUrl);
      if (fileResponse.data.result && fileResponse.data.result.file_path) {
        const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileResponse.data.result.file_path}`;
        return res.json({ avatar_url: photoUrl });
      }
    }

    // Если аватарка не найдена, отправляем default.png из текущей папки
    const defaultAvatarPath = path.join(__dirname, 'default.png');
    res.sendFile(defaultAvatarPath);
  } catch (error) {
    console.error('Ошибка при получении аватарки:', error);
    res.status(500).json({ error: 'Ошибка при получении аватарки' });
  }
});

module.exports = router;
