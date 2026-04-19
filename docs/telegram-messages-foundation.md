# Telegram Messages Foundation

## Що додано

Базовий read-only foundation для вкладки **"Повідомлення / Чати"**:

1. Backend wrapper `api/_lib/telegram-user-client.js` для централізованого створення/підключення `TelegramClient`.
2. Новий endpoint `GET /api/telegram-chat-messages?chatId=...&limit=60`.
3. Оновлений UI `src/components/MessagesTab.jsx`:
   - ліворуч завантаження списку діалогів через `GET /api/telegram-list-dialogs`;
   - праворуч завантаження історії повідомлень через `GET /api/telegram-chat-messages`;
   - стани `loading / error / empty` для обох колонок.

## API: `GET /api/telegram-chat-messages`

### Query params
- `chatId` (required): ідентифікатор чату з `/api/telegram-list-dialogs`.
- `limit` (optional): кількість повідомлень, за замовчуванням `60`, обмеження `1..200`.

### Response (200)

```json
{
  "success": true,
  "chatId": "123456789",
  "count": 60,
  "messages": [
    {
      "id": "1001",
      "chatId": "123456789",
      "text": "Привіт!",
      "date": "2026-04-19T10:15:00.000Z",
      "out": false,
      "fromId": "987654321",
      "replyToMsgId": null
    }
  ]
}
```

## Обмеження foundation

- Режим лише читання (без надсилання повідомлень).
- Без мутацій в `AttendanceTab` та `Forms`.
- Без впливу на стабільну логіку вкладки "Відвідування".
