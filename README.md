# Elite Force Roulette — версия с обменом UC и скидки

Серверная версия Telegram Mini App. Основной сервер — Node.js + Express + SQLite.

## Что добавлено
- 1 бесплатный прокрут каждые 24 часа.
- До 5 платных прокрутов за 24 часа по 100 монет.
- В рулетке пока только 1 доступный приз 60 UC.
- 60 UC в рулетке имеет низкий вес и после выдачи призовой запас уменьшается.
- Скидка 25% на экипировку также выдаётся уникальным кодом.
- Обмен **3500 монет → 60 UC** создаёт код и отправляет уведомление администратору.
- Обмен **900 монет → скидка 25% на экипировку** также создаёт отдельный код и отправляет уведомление администратору.
- Монеты списываются сразу после обмена.
- Каждый код действует 10 дней.
- Админ внутри Mini App видит все коды и может нажать «Выдано» или «Аннулировать».
- Подписка на канал проверяется через Telegram Bot API.
- Реферальная награда — 100 монет после подписки приглашённого на канал и его первого прокрута.
- Настройки обмена, скидки, шансов, лимитов и наград доступны в админке.

## Важно: не загружай этот сервер как обычный статический сайт на Netlify
Эта версия использует Node.js, SQLite и Telegram Bot API. Если просто загрузить ZIP в Netlify как статический сайт, `/api/*` будет получать HTML Netlify вместо JSON. Именно это вызывает ошибку `Unexpected token '<'`.

Для полной версии используй Render/Railway/VPS.

## Render
1. Создай Web Service из этого проекта.
2. Build command: `npm install`
3. Start command: `npm start`
4. Переменные окружения:
   - `BOT_TOKEN` — токен бота из BotFather.
   - `ADMIN_TELEGRAM_ID` — твой Telegram ID.
   - `BOT_USERNAME` — username бота без `@`.
   - `CHANNEL_USERNAME` — username канала с `@`.
   - `CHANNEL_URL` — ссылка на канал.
   - `WEBAPP_URL` — HTTPS URL Render-сервиса.
5. Бот должен быть администратором канала, чтобы Telegram разрешил проверку подписки.
6. В BotFather укажи `WEBAPP_URL` как URL Mini App.

## Настройки по умолчанию
- 3500 монет = 60 UC
- 900 монет = скидка 25% на экипировку
- 50 монет за подписку
- 100 монет за активированного реферала
- 100 монет — цена платного прокрута
- 5 платных прокрутов / 24 часа
- 1 бесплатный прокрут / 24 часа
- 10 дней срок действия кодов


### Исправление канала и рефералов
В Render → Environment обязательно укажи:
- `BOT_USERNAME` — username бота без `@`;
- `CHANNEL_USERNAME` — username канала с `@`;
- `CHANNEL_URL` — `https://t.me/username_канала`;
- `WEBAPP_URL` — текущий HTTPS URL Render;
- `BOT_TOKEN` — токен бота.

Если `CHANNEL_URL` не указан, приложение автоматически построит ссылку из `CHANNEL_USERNAME`.
Реферальная ссылка имеет вид `https://t.me/BOT_USERNAME?start=ID`. Бот получает `/start ID`, сохраняет пригласившего и выдаёт кнопку открытия Mini App с `startapp=ID`. После подтверждения подписки приглашённого реферер получает 100 монет один раз.


### Channel/referral setup
Set `CHANNEL_USERNAME` (for public channels) or `CHANNEL_CHAT_ID` (for private channels). The bot must be an administrator/member of the channel so `getChatMember` can verify subscriptions. Referral links use `https://t.me/<BOT_USERNAME>?start=<USER_ID>`; the bot stores the referrer and passes it into the Mini App.
