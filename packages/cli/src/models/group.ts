import { z } from "zod";

export const GroupModelSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(128),
  sort_order: z.number().int().nonnegative(),
  created_at: z.string(),
});

export type GroupModel = z.infer<typeof GroupModelSchema>;

export const CreateGroupInputSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(128),
});

export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;
