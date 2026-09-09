/**
 * Shared AI-outage notifications for the TradingBotTelegram competition bots.
 *
 * One call replaces the per-bot inline `sendMessage(MAIN_CHAT_ID, "AI API is unavailable")`:
 *   - the TESTING group always gets the full diagnostic (bot, symbol, HTTP code, error excerpt);
 *   - the MAIN group gets a short "Signal delayed" notice, throttled per bot, and never for
 *     transient client-side timeouts (the next scan retries those within minutes).
 */
export type OutageKind = "credits" | "key_limit" | "auth" | "rate_limit" | "upstream" | "timeout" | "other";
export interface Classified {
    kind: OutageKind;
    status?: number;
    excerpt: string;
}
export interface TelegramLike {
    sendMessage(chatId: number | string, text: string, extra?: any): Promise<unknown>;
}
export interface ReportAiOutageOptions {
    telegram: TelegramLike;
    /** Human-readable bot identity, e.g. Telegram username or model id. */
    botName: string;
    mainChatId: number | string;
    testingChatId: number | string;
    error: unknown;
    context?: {
        symbol?: string;
        source?: "scan" | "manual";
        extra?: string;
    };
    /** Minimum gap between two "Signal delayed" notices in the main group. Default 6h. */
    mainNoticeCooldownMs?: number;
    /** Which kinds are announced in the main group. Default: everything except timeout. */
    mainNoticeKinds?: OutageKind[];
    now?: () => number;
    log?: (msg: string) => void;
}
export interface ReportAiOutageResult {
    classified: Classified;
    postedMain: boolean;
    postedTesting: boolean;
}
/** Extract the message, unwrapping the bots' `[AI_API_FAILURE] Signal AI unavailable: ...` wrapper. */
export declare function errorText(err: unknown): string;
export declare function classifyAiError(err: unknown): Classified;
export declare function formatTestingMessage(botName: string, c: Classified, ctx?: ReportAiOutageOptions["context"]): string;
export declare function formatMainMessage(_c: Classified): string;
/** Test hook. */
export declare function _resetThrottle(): void;
export declare function reportAiOutage(opts: ReportAiOutageOptions): Promise<ReportAiOutageResult>;
