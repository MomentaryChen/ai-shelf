export const SESSION_STATUSES = ["pending", "running", "stopped", "failed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
