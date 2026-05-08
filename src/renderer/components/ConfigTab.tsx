import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge } from "./Badge";
import { toolIcon, toolLabel } from "../utils";

export function ConfigTab({ data }: { data: ProviderEntry[] }) {
  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">⚙️ Config Files</h2>

      {data.map((e) => {
        const allPaths = [
          ...e.config.paths.map((p) => ({ type: "Config", path: p })),
          ...e.config.instructionFiles.map((p) => ({ type: "Instructions", path: p })),
          ...e.mcp.configPaths.map((p) => ({ type: "MCP", path: p })),
        ];

        return (
          <Card key={e.tool} title={<>{toolIcon(e.tool)} {toolLabel(e.tool)}</>}>
            {allPaths.length > 0 ? (
              <DataTable headers={["Type", "Path"]}>
                {allPaths.map((item) => (
                  <tr key={item.path}>
                    <Td><Badge text={item.type} variant="info" /></Td>
                    <Td>
                      <span
                        className="break-all rounded bg-accent/8 px-1.5 py-0.5 font-mono text-xs text-accent cursor-pointer hover:bg-accent/20 hover:underline"
                        title="Click to open"
                        onClick={() => window.api.openPath(item.path)}
                      >
                        {item.path}
                      </span>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <p className="text-text-secondary">(no config files found)</p>
            )}
          </Card>
        );
      })}
    </>
  );
}
