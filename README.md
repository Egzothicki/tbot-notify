# @egzothicki/tbot-notify

Shared AI-outage notifications for the TradingBotTelegram competition bots.

```ts
import { reportAiOutage } from "@egzothicki/tbot-notify";

await reportAiOutage({
  telegram: bot.telegram,
  botName: bot.botInfo?.username ?? config.OPENAI_MODEL,
  mainChatId: MAIN_CHAT_ID,
  testingChatId: TESTING_CHAT_ID,
  error: e,
  context: { symbol, source: "scan" },
});
```

- Testing group: always gets `🚨 AI outage: <bot>` with the cause (402 credits / 403 key limit / 401 / 429 / 5xx / timeout) and the error excerpt.
- Main group: `⏳ Signal delayed. Will retry on the next scan.` at most once per bot per 6h, never for timeouts.

Install in a bot: `npm i github:Egzothicki/tbot-notify#v1.0.0` (dist/ is committed, no build step on install).
Release: bump version, `npm run build && npm test`, commit dist, tag `vX.Y.Z`, push tag.
