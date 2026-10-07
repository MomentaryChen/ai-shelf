import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numberedPaneLabels } from "./pane-label-numbering.js";

const label = (tool: string) => (tool === "shell" ? "Shell" : tool[0]!.toUpperCase() + tool.slice(1));

describe("numberedPaneLabels", () => {
  it("leaves a single pane per tool unnumbered", () => {
    assert.deepEqual(
      numberedPaneLabels(
        [
          { id: "a", tool: "shell" },
          { id: "b", tool: "claude" },
        ],
        label,
      ),
      { a: "Shell", b: "Claude" },
    );
  });

  it("numbers untitled panes that share a tool, in order", () => {
    assert.deepEqual(
      numberedPaneLabels(
        [
          { id: "a", tool: "shell" },
          { id: "b", tool: "claude" },
          { id: "c", tool: "shell" },
        ],
        label,
      ),
      { a: "Shell 1", b: "Claude", c: "Shell 2" },
    );
  });

  it("keeps custom titles and excludes them from numbering", () => {
    assert.deepEqual(
      numberedPaneLabels(
        [
          { id: "a", tool: "shell", title: "  api  " },
          { id: "b", tool: "shell" },
          { id: "c", tool: "shell", title: "  " },
        ],
        label,
      ),
      { a: "api", b: "Shell 1", c: "Shell 2" },
    );
  });
});
