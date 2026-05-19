export interface ProcessRecord {
  runtimeId: string;
  sessionId: string;
  pid: number | null;
  tool?: string;
}

/** In-memory registry mapping runtime handles to session metadata. */
export class ProcessRegistry {
  private readonly records = new Map<string, ProcessRecord>();
  private readonly bySessionId = new Map<string, string>();

  register(record: ProcessRecord): void {
    this.records.set(record.runtimeId, record);
    this.bySessionId.set(record.sessionId, record.runtimeId);
  }

  get(runtimeId: string): ProcessRecord | undefined {
    return this.records.get(runtimeId);
  }

  getBySessionId(sessionId: string): ProcessRecord | undefined {
    const runtimeId = this.bySessionId.get(sessionId);
    return runtimeId ? this.records.get(runtimeId) : undefined;
  }

  delete(runtimeId: string): boolean {
    const record = this.records.get(runtimeId);
    if (!record) return false;
    this.records.delete(runtimeId);
    this.bySessionId.delete(record.sessionId);
    return true;
  }

  list(): ProcessRecord[] {
    return [...this.records.values()];
  }
}
