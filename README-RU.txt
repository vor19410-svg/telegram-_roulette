ELITE FORCE MINI APP — RENDER (обновлённый комплект)

Файлы: index.html, server.js, api.mjs, package.json.

Render:
- Build Command: npm install
- Start Command: npm start
- Environment: TELEGRAM_BOT_TOKEN=<токен от BotFather>
- Environment: ADMIN_TELEGRAM_ID=<ваш Telegram ID>
- Environment: DATA_DIR=/var/data
- Добавьте Persistent Disk с Mount Path /var/data.

Задания:
- Убраны задания «Открой раздел рулетки», приглашение друзей и ежедневный бонус.
- Оставлено задание подписки с кнопкой «Перейти на канал» и «Получить монеты».
- По умолчанию ссылка канала в index.html — https://t.me/EliteForce. Замените CHANNEL_URL на ссылку своего канала.

Админка:
- Вход разрешён только Telegram ID из ADMIN_TELEGRAM_ID.
- Есть настройки бесплатных прокруток, цены повторного прокрута, цен и остатков предметов, вероятностей наград.
- Коды можно отметить использованными или аннулировать.
- Настройки сохраняются в DATA_DIR/settings.json через серверное хранилище.

Перед заменой файлов проверьте проект в тестовом сервисе. Не публикуйте TELEGRAM_BOT_TOKEN.

РЕФЕРАЛЬНАЯ СИСТЕМА
- Награда по умолчанию: пригласившему 70 монет, приглашённому 35 монет.
- В Render добавьте TELEGRAM_BOT_USERNAME без символа @ (например, MyBot).
- Реферальные награды обрабатываются при первом открытии Mini App с параметром start_param вида ref_<Telegram ID>.
- ВАЖНО: ссылка вида t.me/<bot>?start=... сама по себе не открывает Mini App автоматически. Настройте обработчик команды /start у Telegram-бота, чтобы он показывал кнопку открытия Mini App и передавал реферальный параметр. Без этого шага полная реферальная цепочка не заработает.
- Для сохранения данных между перезапусками Render подключите Persistent Disk и задайте DATA_DIR=/var/data.
