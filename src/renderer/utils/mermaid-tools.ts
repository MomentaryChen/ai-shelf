/** Mermaid diagram templates and helpers for the Tools Mermaid panel. */

export const MERMAID_TEMPLATE_IDS = [
  "flowchart",
  "sequence",
  "class",
  "state",
  "er",
  "gantt",
  "pie",
  "mindmap",
] as const;

export type MermaidTemplateId = (typeof MERMAID_TEMPLATE_IDS)[number];

export type MermaidTemplate = {
  id: MermaidTemplateId;
  source: string;
};

export const MERMAID_TEMPLATES: readonly MermaidTemplate[] = [
  {
    id: "flowchart",
    source: `flowchart TD
  Start[Start] --> Decide{Ready?}
  Decide -->|Yes| Work[Do the work]
  Decide -->|No| Wait[Gather inputs]
  Wait --> Decide
  Work --> Done([Done])`,
  },
  {
    id: "sequence",
    source: `sequenceDiagram
  actor User
  participant App
  participant API
  User->>App: Submit request
  App->>API: POST /action
  API-->>App: 200 OK
  App-->>User: Show result`,
  },
  {
    id: "class",
    source: `classDiagram
  class Session {
    +String id
    +String cwd
    +start()
    +stop()
  }
  class Profile {
    +String name
    +attach(Session)
  }
  Profile "1" --> "*" Session : owns`,
  },
  {
    id: "state",
    source: `stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> Idle: exit
  Running --> Failed: error
  Failed --> Idle: reset
  Idle --> [*]`,
  },
  {
    id: "er",
    source: `erDiagram
  PROFILE ||--o{ SESSION : has
  SESSION ||--o{ PANE : contains
  PROFILE {
    string id PK
    string name
  }
  SESSION {
    string id PK
    string profileId FK
    string status
  }
  PANE {
    string id PK
    string sessionId FK
  }`,
  },
  {
    id: "gantt",
    source: `gantt
  title Release checklist
  dateFormat YYYY-MM-DD
  section Build
    Compile      :a1, 2026-10-01, 2d
    Package      :a2, after a1, 1d
  section Verify
    Smoke tests  :b1, after a2, 2d
    Docs assets  :b2, after b1, 1d`,
  },
  {
    id: "pie",
    source: `pie showData
  title Time spent
  "Coding" : 45
  "Review" : 25
  "Docs" : 20
  "Meetings" : 10`,
  },
  {
    id: "mindmap",
    source: `mindmap
  root((AI Shelf))
    Terminal
      Profiles
      Panes
    Inventory
      Models
      MCP
    Tools
      Codec
      Mermaid
    Flow
      DAG
      Runs`,
  },
] as const;

const TEMPLATE_BY_ID = new Map(MERMAID_TEMPLATES.map((t) => [t.id, t]));

export function getMermaidTemplate(id: MermaidTemplateId): MermaidTemplate {
  const found = TEMPLATE_BY_ID.get(id);
  if (!found) throw new Error(`Unknown Mermaid template: ${id}`);
  return found;
}

/** Default sample shown when the Mermaid tool opens. */
export const DEFAULT_MERMAID_SOURCE = getMermaidTemplate("flowchart").source;

/** Wrap raw Mermaid source in a Markdown fenced code block. */
export function wrapMermaidFence(source: string): string {
  const body = source.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  return `\`\`\`mermaid\n${body}\n\`\`\``;
}

/** Best-effort strip of a surrounding \`\`\`mermaid fence (keeps inner source). */
export function unwrapMermaidFence(input: string): string {
  const trimmed = input.replace(/\r\n/g, "\n").trim();
  const match = trimmed.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i);
  const body = match?.[1];
  return body != null ? body.trimEnd() : trimmed;
}
