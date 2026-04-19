# Telegram (user account / MTProto) audit for Messages/Chats

Date: 2026-04-18

## Existing Telegram-related server files

- `api/send-test-telegram.js`
  - Sends a message from a **Telegram user account** via GramJS (`telegram` package).
  - Requires `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`.
  - Status: working for send tests (as confirmed historically).

- `api/telegram-list-dialogs.js`
  - Reads dialogs from the same user session via `client.getDialogs({ limit: 100 })`.
  - Returns normalized list (`id`, `title`, `username`).
  - Status: code path exists and is complete for dialogs listing.

- `api/link-student-telegram.js`
  - Not MTProto. Links a student record with Telegram metadata in Supabase (`telegram_user_id`, `telegram_display_name`, `telegram_linked_at`).
  - Status: independent helper for CRM linkage.

- `api/bot.js`
  - Bot-based integration with Telegraf using `TELEGRAM_TOKEN`.
  - Different integration mode (bot API) than user-account MTProto used by messages/chats foundation.

## Added foundation files

- `api/_lib/telegram-user-client.js`
  - Shared safe factory/wrapper for Telegram user-account client.
  - Centralized env validation and connect/disconnect lifecycle.

- `api/telegram-chat-messages.js`
  - New endpoint for reading chat history (Messages tab foundation).
  - Supports `GET ?chatId=...` or `GET ?username=...` and optional `limit` (1..100).
  - Uses shared client wrapper.

## What already works vs what is still missing

### Already working
- Sending message from user account (`send-test-telegram`).
- Listing dialogs from user account (`telegram-list-dialogs`).

### Still missing for full UI integration
- Front-end integration for dialogs + message thread rendering.
- Polling/realtime update strategy for new messages.
- Unified endpoint/service contract consumption from `AttendanceTab` Messages/Chats flow.
- Permission/role safeguards for who can read/send from work account.
