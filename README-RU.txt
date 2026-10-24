ELITE FORCE MINI APP — Render

Файлы:
- index.html — интерфейс Telegram Mini App
- server.js — HTTP-сервер для Render
- api.mjs — серверная логика и хранение данных в JSON
- package.json — команда запуска

Render:
Build Command: npm install
Start Command: npm start

Environment Variables:
TELEGRAM_BOT_TOKEN = токен бота от BotFather
ADMIN_TELEGRAM_ID = числовой Telegram ID администратора
DATA_DIR = /var/data (если подключён Persistent Disk)

ВАЖНО: чтобы пользователи/балансы/коды не терялись после перезапуска и нового деплоя,
в Render открой Settings → Disks и подключи Persistent Disk с Mount Path /var/data,
затем задай DATA_DIR=/var/data. На бесплатном Render диски могут быть недоступны;
без диска локальные JSON-данные могут сбрасываться при новом деплое.

После настройки переменных сделай Manual Deploy → Deploy latest commit.
