import { Logger, type ILogObj } from "tslog";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// ─── Log level: debug in dev, warn in production ─────────
const isDev = import.meta.env.DEV;

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

const NAME_COL = 22; // enough for [ECScope:FileTransfer]

const rootLogger = new Logger<ILogObj>({
    name: "ECScope",
    minLevel: isDev ? 2 : 4, // 2 = debug, 4 = warn
    type: "pretty",
    stylePrettyLogs: false,
    maskValuesOfKeys: ["accessKeyId", "secretAccessKey", "sessionToken", "password"],
    maskValuesOfKeysCaseInsensitive: true,
    overwrite: {
        transportFormatted: (_logMetaMarkup, logArgs, logErrors, logMeta) => {
            const d = logMeta?.date instanceof Date ? logMeta.date : new Date();
            const ts = formatDate(d);
            const level = (logMeta?.logLevelName ?? "LOG").padEnd(5);
            const parts = logMeta?.parentNames ? [...logMeta.parentNames, logMeta.name] : [logMeta?.name ?? ""];
            const tag = `[${parts.join(":")}]`.padEnd(NAME_COL);
            const prefix = `${ts} ${level} ${tag}`;

            const fn = logMeta?.logLevelName === "ERROR" || logMeta?.logLevelName === "FATAL"
                ? console.error
                : logMeta?.logLevelName === "WARN"
                    ? console.warn
                    : logMeta?.logLevelName === "INFO"
                        ? console.info
                        : console.log;

            fn(prefix, ...logArgs, ...logErrors);
        },
    },
});

/** Create a named sub-logger for a module */
export function createLogger(name: string): Logger<ILogObj> {
    return rootLogger.getSubLogger({ name });
}

// ─── Pre-built sub-loggers per domain ────────────────────

export const log = {
    aws: createLogger("aws"),
    config: createLogger("config"),
    ecs: createLogger("ecs"),
    alb: createLogger("alb"),
    ec2: createLogger("ec2"),
    cloudwatch: createLogger("cloudwatch"),
    ssm: createLogger("ssm"),
    s3: createLogger("s3"),
};

// ─── Runtime level control ───────────────────────────────

/**
 * Change the log level at runtime. Call from browser console:
 *   window.__setLogLevel(0)   // silly — show everything
 *   window.__setLogLevel(2)   // debug
 *   window.__setLogLevel(3)   // info
 *   window.__setLogLevel(4)   // warn
 *   window.__setLogLevel(5)   // error
 *   window.__setLogLevel(6)   // fatal (suppress almost everything)
 */
export function setLogLevel(level: number) {
    rootLogger.settings.minLevel = level;
}

if (typeof window !== "undefined") {
    (window as any).__setLogLevel = setLogLevel;
}

// ─── Logged Tauri invoke wrapper ─────────────────────────

const cmdLogger = createLogger("cmd");

/**
 * Drop-in replacement for `invoke()` that logs command input/output.
 * Usage: `import { invoke } from "@/lib/logger";`
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    cmdLogger.debug(`→ ${cmd}`, args ?? {});
    try {
        const result = await tauriInvoke<T>(cmd, args);
        cmdLogger.debug(`← ${cmd} OK`);
        return result;
    } catch (err) {
        cmdLogger.error(`← ${cmd} FAILED`, err);
        throw err;
    }
}
