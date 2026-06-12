type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLevel(): LogLevel {
  return "debug"; // TODO: read from storage
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getLevel()];
}

function format(level: LogLevel, msg: string, data?: unknown): string {
  const ts = new Date().toISOString().slice(11, 23);
  return `[${ts}] [cphub-ext] [${level.toUpperCase()}] ${msg}`;
}

export const logger = {
  debug(msg: string, data?: unknown) {
    if (shouldLog("debug")) console.debug(format("debug", msg), data ?? "");
  },
  info(msg: string, data?: unknown) {
    if (shouldLog("info")) console.log(format("info", msg), data ?? "");
  },
  warn(msg: string, data?: unknown) {
    if (shouldLog("warn")) console.warn(format("warn", msg), data ?? "");
  },
  error(msg: string, data?: unknown) {
    if (shouldLog("error")) console.error(format("error", msg), data ?? "");
  },
};
