import { z } from "zod";

export const AppConfigSchema = z.object({
  workspaceRoot: z.string().default(""),
  defaultShell: z.enum(["pwsh", "powershell", "cmd", "bash"]).default("pwsh"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const APP_NAME = "ai-cli-inventory";
export const APP_TITLE = "AI CLI Inventory — Terminal Workspace Manager";
