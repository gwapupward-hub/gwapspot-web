# Daily Ideas scheduled delivery invariants

- Telegram remains a client; schedule state is owned by the shared GWAP core.
- Delivery is opt-in. New users are disabled until a valid timezone is supplied.
- One bounded scheduler claims due users in batches instead of creating per-user cron jobs.
- A delivery record is written before Telegram send work begins.
- Claims advance the next canonical schedule immediately to prevent duplicate cron claims.
- Explicit send failures may retry up to three times before returning to the canonical schedule.
- Daily and weekdays cadence use IANA timezone calculations through `Intl.DateTimeFormat`.
- The internal delivery route requires the existing versioned service credential and never exposes Telegram tokens or provider credentials.
