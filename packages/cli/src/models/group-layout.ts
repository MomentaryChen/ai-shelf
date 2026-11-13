import { z } from "zod";
import { normalizeRemoteSshConfig } from "../runtime/ssh-remote.js";

export const SavedCommandSnippetSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(64),
  command: z.string().min(1).max(4096),
  broadcast: z.boolean().optional().default(false),
});

export type SavedCommandSnippet = z.infer<typeof SavedCommandSnippetSchema>;

export const SavedPaneSlotSchema = z.object({
  tool: z.string().min(1),
  cwd: z.string(),
  title: z.string().max(64).optional(),
  /** AI agent conversation id (desktop resumes it on restore); validated at launch. */
  agentSessionId: z.string().max(128).optional(),
});

/** Outer `.optional()` keeps the key optional; undefined skips the transform. */
const RemoteSshSchema = z.unknown().transform((value) => normalizeRemoteSshConfig(value)).optional();

export type SerializedLayoutNode =
  | { kind: "pane"; index: number }
  | {
      kind: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: SerializedLayoutNode;
      second: SerializedLayoutNode;
    };

export const GroupLayoutSnapshotSchema = z.object({
  defaultCwd: z.string(),
  defaultTool: z.string().min(1).optional().default("claude"),
  panes: z.array(SavedPaneSlotSchema).max(4),
  layout: z.custom<SerializedLayoutNode | null>().nullable(),
  broadcastInput: z.boolean().optional().default(false),
  accentColor: z.string().nullable().optional(),
  savedCommands: z.array(SavedCommandSnippetSchema).optional(),
  /**
   * SSH remote for every pane of the profile. `undefined` = "not provided"
   * (writers keep the stored value); `null` = local profile. Invalid → null.
   */
  remote: RemoteSshSchema,
  updatedAt: z.string(),
});

export type SavedPaneSlot = z.infer<typeof SavedPaneSlotSchema>;
export type GroupLayoutSnapshot = z.infer<typeof GroupLayoutSnapshotSchema>;

export const GroupLayoutMetaSchema = z.object({
  paneCount: z.number().int().min(0).max(4),
  defaultCwd: z.string(),
  defaultTool: z.string().optional().default("claude"),
  broadcastInput: z.boolean().optional().default(false),
  accentColor: z.string().nullable().optional(),
  updatedAt: z.string(),
});

export type GroupLayoutMeta = z.infer<typeof GroupLayoutMetaSchema>;
