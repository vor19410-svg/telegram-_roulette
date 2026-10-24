ELITE FORCE MINI APP — RENDER

Файлы: index.html, server.js, api.mjs, package.json.

Render настройки:
- Service type: Web Service
- Build Command: npm install
- Start Command: npm start
- Environment: TELEGRAM_BOT_TOKEN=<токен от BotFather>
- Environment: ADMIN_TELEGRAM_ID=<ваш Telegram ID>
- Environment: DATA_DIR=/var/data

ВАЖНО: добавьте Persistent Disk в Render с Mount Path /var/data, иначе данные могут потеряться при перезапуске/новом deploy.

В магазине заданы начальные цены: FULL 6 — 10000; Пушка — 5000; 30 UC — 1800; 60 UC — 3500; Шлем — 1200; Броня — 1500; Сумка — 1000 монет. Начальный остаток каждой награды — 100. Изменение цен и остатков через админку пока не реализовано в этом комплекте.

Откройте приложение только через Telegram Mini App, потому что сервер проверяет Telegram initData. Не публикуйте BOT TOKEN.
