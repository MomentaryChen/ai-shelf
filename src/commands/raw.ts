import { spawn } from "node:child_process";

export async function runRaw(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: ai raw <tool> [args...]");
    console.error("Example: ai raw copilot --version");
    process.exit(1);
  }

  const [tool, ...rest] = args;
  const child = spawn(tool, rest, {
    stdio: "inherit",
    shell: true,
    windowsHide: false,
  });

  child.on("error", (err) => {
    console.error(`Failed to run ${tool}: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
