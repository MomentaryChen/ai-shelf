import { z } from "zod";

export const WorkspaceModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  root_path: z.string().nullable(),
  created_at: z.string(),
});

export type WorkspaceModel = z.infer<typeof WorkspaceModelSchema>;

export const CreateWorkspaceInputSchema = z.object({
  name: z.string().min(1).max(128),
  root_path: z.string().optional(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;
