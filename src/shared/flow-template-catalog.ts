/** Bundled Flow templates shipped in `src/assets/flows/`. */
export type FlowTemplateCategory = "starter" | "automation" | "productivity";

export interface FlowTemplateCatalogEntry {
  id: string;
  fileName: string;
  category: FlowTemplateCategory;
  /** i18n key prefix: `flow.template.<id>.title` / `.desc` / `.tag` */
  messageId: string;
}

export const FLOW_TEMPLATE_CATALOG: readonly FlowTemplateCatalogEntry[] = [
  {
    id: "example-google-check",
    fileName: "example-google-check.flow.md",
    category: "starter",
    messageId: "exampleGoogleCheck",
  },
  {
    id: "daily-standup",
    fileName: "daily-standup.flow.md",
    category: "productivity",
    messageId: "dailyStandup",
  },
  {
    id: "weekly-digest",
    fileName: "weekly-digest.flow.md",
    category: "automation",
    messageId: "weeklyDigest",
  },
] as const;

const FILE_NAMES = new Set(FLOW_TEMPLATE_CATALOG.map((e) => e.fileName));

export function isBundledFlowTemplateFile(fileName: string): boolean {
  return FILE_NAMES.has(fileName);
}
