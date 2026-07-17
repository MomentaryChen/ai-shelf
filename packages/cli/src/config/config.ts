import { z } from "zod";
import { PTY_SHELL_PREFERENCE_VALUES } from "../runtime/pty-shell.js";

export const AppConfigSchema = z.object({
  workspaceRoot: z.string().default(""),
  defaultShell: z.enum(PTY_SHELL_PREFERENCE_VALUES).default("auto"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const APP_NAME = "ai-shelf";
export const APP_TITLE = "AI Shelf — Terminal Profile Manager";
