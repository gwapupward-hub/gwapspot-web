# Internal delivery API

`GET /api/v1/daily-ideas/telegram/delivery?telegramUserId=<id>` reads delivery preferences.

`POST /api/v1/daily-ideas/telegram/delivery` supports these service-authenticated actions:

- `preferences` — enable/disable delivery and update IANA timezone, local hour, and daily/weekdays cadence.
- `claim` — claim a bounded batch of due users for the centralized scheduler.
- `complete` — record Telegram send success/failure and apply retry/canonical scheduling behavior.

All calls require the existing Daily Ideas contract-version header and internal service credential.
