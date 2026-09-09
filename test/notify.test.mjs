import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAiError, reportAiOutage, _resetThrottle } from "../dist/index.js";

const wrap = (m) => new Error(`[AI_API_FAILURE] Signal AI unavailable: ${m}`);

test("classifies OpenRouter 402 / 403 / abort", () => {
  assert.equal(classifyAiError(wrap("OpenAI request failed (402): This request requires more credits, or fewer max_tokens.")).kind, "credits");
  assert.equal(classifyAiError(wrap("OpenAI request failed (403): Key limit exceeded (weekly limit).")).kind, "key_limit");
  assert.equal(classifyAiError(wrap("This operation was aborted")).kind, "timeout");
  assert.equal(classifyAiError(wrap("OpenAI request failed (503): upstream")).kind, "upstream");
  assert.equal(classifyAiError(wrap("[\n  { code: 'invalid_type' } ]")).kind, "other");
});

function fakeTg() { const sent = []; return { sent, sendMessage: async (id, text) => { sent.push([id, text]); } }; }

test("posts diagnostic to testing, throttled notice to main, nothing to main on timeout", async () => {
  _resetThrottle();
  let t = 0; const now = () => t;
  const tg = fakeTg();
  const base = { telegram: tg, botName: "bot_a", mainChatId: 1, testingChatId: 2, now, log: () => {} };
  let r = await reportAiOutage({ ...base, error: wrap("OpenAI request failed (402): requires more credits"), context: { symbol: "SOL/USDT", source: "scan" } });
  assert.equal(r.postedMain, true); assert.equal(r.postedTesting, true);
  assert.equal(tg.sent.length, 2);
  assert.match(tg.sent[0][1], /bot_a[\s\S]*402[\s\S]*SOL\/USDT/);
  assert.equal(tg.sent[1][1], "⏳ Signal delayed. Will retry on the next scan.");
  t += 60_000;
  r = await reportAiOutage({ ...base, error: wrap("OpenAI request failed (402): x") });
  assert.equal(r.postedMain, false); assert.equal(tg.sent.length, 3);
  t += 6 * 3600 * 1000;
  r = await reportAiOutage({ ...base, error: wrap("OpenAI request failed (402): x") });
  assert.equal(r.postedMain, true);
  r = await reportAiOutage({ ...base, botName: "bot_b", error: wrap("This operation was aborted") });
  assert.equal(r.postedMain, false); assert.equal(r.postedTesting, true);
});

test("telegram failure does not throw", async () => {
  const r = await reportAiOutage({ telegram: { sendMessage: async () => { throw new Error("blocked"); } }, botName: "x", mainChatId: 1, testingChatId: 2, error: wrap("(402) c"), log: () => {} });
  assert.equal(r.postedMain, false); assert.equal(r.postedTesting, false);
});
