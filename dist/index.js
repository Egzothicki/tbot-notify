/**
 * Shared AI-outage notifications for the TradingBotTelegram competition bots.
 *
 * One call replaces the per-bot inline `sendMessage(MAIN_CHAT_ID, "AI API is unavailable")`:
 *   - the TESTING group always gets the full diagnostic (bot, symbol, HTTP code, error excerpt);
 *   - the MAIN group gets a short "Signal delayed" notice, throttled per bot, and never for
 *     transient client-side timeouts (the next scan retries those within minutes).
 */
const DEFAULT_MAIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAIN_KINDS = ["credits", "key_limit", "auth", "rate_limit", "upstream", "other"];
const AI_API_FAILURE_PREFIX = "[AI_API_FAILURE]";
/** Extract the message, unwrapping the bots' `[AI_API_FAILURE] Signal AI unavailable: ...` wrapper. */
export function errorText(err) {
    let msg = "";
    if (err && typeof err === "object") {
        const anyErr = err;
        msg = String(anyErr.message ?? anyErr.body?.error?.message ?? err);
        const bodyMsg = anyErr.body?.error?.message;
        if (typeof bodyMsg === "string" && !msg.includes(bodyMsg))
            msg = `${msg} | ${bodyMsg}`;
    }
    else {
        msg = String(err ?? "");
    }
    msg = msg.trim();
    if (msg.startsWith(AI_API_FAILURE_PREFIX))
        msg = msg.slice(AI_API_FAILURE_PREFIX.length).trim();
    msg = msg.replace(/^Signal AI unavailable:\s*/i, "");
    return msg;
}
function statusOf(err, text) {
    const anyErr = err;
    const direct = Number(anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status);
    if (Number.isFinite(direct) && direct >= 100)
        return direct;
    const m = /\((\d{3})\)/.exec(text) ?? /\b(?:status|HTTP)\s*:?\s*(\d{3})\b/i.exec(text);
    return m ? Number(m[1]) : undefined;
}
export function classifyAiError(err) {
    const text = errorText(err);
    const lower = text.toLowerCase();
    const status = statusOf(err, text);
    const excerpt = text.replace(/\s+/g, " ").slice(0, 300);
    const isTimeout = lower.includes("operation was aborted") ||
        lower.includes("aborterror") ||
        lower.includes("timed out") ||
        lower.includes("timeout") ||
        lower.includes("etimedout") ||
        lower.includes("socket hang up") ||
        err?.name === "AbortError";
    if (isTimeout && status === undefined)
        return { kind: "timeout", excerpt };
    if (status === 402 || lower.includes("requires more credits") || lower.includes("insufficient credits"))
        return { kind: "credits", status: status ?? 402, excerpt };
    if (status === 403 || lower.includes("key limit exceeded"))
        return { kind: "key_limit", status: status ?? 403, excerpt };
    if (status === 401)
        return { kind: "auth", status, excerpt };
    if (status === 429 || lower.includes("rate limit"))
        return { kind: "rate_limit", status: status ?? 429, excerpt };
    if (status !== undefined && status >= 500)
        return { kind: "upstream", status, excerpt };
    return { kind: "other", status, excerpt };
}
const KIND_LABEL = {
    credits: "OpenRouter credits exhausted (402) — top up at openrouter.ai",
    key_limit: "OpenRouter key spend limit hit (403) — raise/reset the key limit",
    auth: "AI API auth failed (401) — key invalid or rotated",
    rate_limit: "AI API rate limited (429)",
    upstream: "AI provider/gateway error (5xx)",
    timeout: "AI request timed out (client abort) — transient, will retry next scan",
    other: "AI API request failed",
};
export function formatTestingMessage(botName, c, ctx) {
    const lines = [
        `🚨 AI outage — ${botName}`,
        `Cause: ${KIND_LABEL[c.kind]}`,
    ];
    if (ctx?.symbol)
        lines.push(`Symbol: ${ctx.symbol}${ctx.source ? ` (${ctx.source})` : ""}`);
    else if (ctx?.source)
        lines.push(`Source: ${ctx.source}`);
    if (ctx?.extra)
        lines.push(ctx.extra);
    lines.push(`Error: ${c.excerpt || "(no message)"}`);
    return lines.join("\n");
}
export function formatMainMessage(_c) {
    return "⏳ Signal delayed — will retry on the next scan.";
}
/** Per-process throttle state, keyed by bot name so several bots in one process do not share it. */
const lastMainNoticeAt = new Map();
/** Test hook. */
export function _resetThrottle() {
    lastMainNoticeAt.clear();
}
export async function reportAiOutage(opts) {
    const now = opts.now ?? Date.now;
    const log = opts.log ?? ((m) => console.error(m));
    const classified = classifyAiError(opts.error);
    const result = { classified, postedMain: false, postedTesting: false };
    try {
        await opts.telegram.sendMessage(opts.testingChatId, formatTestingMessage(opts.botName, classified, opts.context));
        result.postedTesting = true;
    }
    catch (e) {
        log(`[tbot-notify] failed to post to testing chat: ${errorText(e)}`);
    }
    const kinds = opts.mainNoticeKinds ?? DEFAULT_MAIN_KINDS;
    if (kinds.includes(classified.kind)) {
        const cooldown = opts.mainNoticeCooldownMs ?? DEFAULT_MAIN_COOLDOWN_MS;
        const t = now();
        const last = lastMainNoticeAt.get(opts.botName) ?? -Infinity;
        if (t - last >= cooldown) {
            try {
                await opts.telegram.sendMessage(opts.mainChatId, formatMainMessage(classified));
                lastMainNoticeAt.set(opts.botName, t);
                result.postedMain = true;
            }
            catch (e) {
                log(`[tbot-notify] failed to post to main chat: ${errorText(e)}`);
            }
        }
    }
    return result;
}
