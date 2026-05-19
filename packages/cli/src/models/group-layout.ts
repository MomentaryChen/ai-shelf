import { z } from "zod";

export const SavedPaneSlotSchema = z.object({
  tool: z.string().min(1),
  cwd: z.string(),
});

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
