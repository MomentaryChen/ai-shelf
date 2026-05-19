import { z } from "zod";
import { SESSION_STATUSES } from "../core/entities/session-status.js";

export const SessionModelSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  group_id: z.string().uuid(),
  name: z.string().min(1).max(128),
  cwd: z.string(),
  shell: z.string(),
  tool: z.string().nullable(),
  pid: z.number().int().nullable(),
  status: z.enum(SESSION_STATUSES),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SessionModel = z.infer<typeof SessionModelSchema>;

export const CreateSessionInputSchema = z.object({
  workspace_id: z.string().uuid(),
  group_id: z.string().uuid(),
  name: z.string().min(1).max(128),
  cwd: z.string().optional(),
  shell: z.string().optional(),
  tool: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
