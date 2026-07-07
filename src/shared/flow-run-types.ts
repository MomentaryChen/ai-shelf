export type FlowRunEvent = {
  t: string;
  type: string;
  flowId?: string;
  phaseId?: string;
  message?: string;
  error?: string;
  outputPath?: string;
  trigger?: string;
  source?: string;
};

export type FlowRunArtifact = "prompt" | "events" | "output" | "runDir";
