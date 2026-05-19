import pino from "pino";
import { join } from "node:path";
import { APP_NAME } from "../config/config.js";
import { ensureAppDataDir } from "../config/loader.js";

export function createLogger(level: string = "info") {
  ensureAppDataDir();
  const logPath = join(ensureAppDataDir(), "logs", "app.log");

  return pino(
    {
      name: APP_NAME,
      level,
    },
    pino.destination({ dest: logPath, sync: true, mkdir: true }),
  );
}

export type Logger = ReturnType<typeof createLogger>;
