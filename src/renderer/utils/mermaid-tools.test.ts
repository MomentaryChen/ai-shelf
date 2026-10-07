import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MERMAID_SOURCE,
  getMermaidTemplate,
  MERMAID_TEMPLATE_IDS,
  MERMAID_TEMPLATES,
  unwrapMermaidFence,
  wrapMermaidFence,
} from "./mermaid-tools.js";

describe("mermaid-tools", () => {
  it("exposes a template for every known id", () => {
    assert.deepEqual(
      MERMAID_TEMPLATES.map((t) => t.id),
      [...MERMAID_TEMPLATE_IDS],
    );
    for (const id of MERMAID_TEMPLATE_IDS) {
      const template = getMermaidTemplate(id);
      assert.equal(template.id, id);
      assert.ok(template.source.trim().length > 0);
    }
  });

  it("defaults to the flowchart sample", () => {
    assert.equal(DEFAULT_MERMAID_SOURCE, getMermaidTemplate("flowchart").source);
  });

  it("wraps and unwraps mermaid fences", () => {
    const source = "flowchart TD\n  A --> B";
    const fenced = wrapMermaidFence(source);
    assert.equal(fenced, "```mermaid\nflowchart TD\n  A --> B\n```");
    assert.equal(unwrapMermaidFence(fenced), source);
    assert.equal(unwrapMermaidFence(source), source);
  });

  it("unwraps fences without a language tag", () => {
    assert.equal(unwrapMermaidFence("```\npie\n  \"A\" : 1\n```"), 'pie\n  "A" : 1');
  });
});
