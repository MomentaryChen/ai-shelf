import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version: cliVersion } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __CLI_VERSION__: JSON.stringify(cliVersion),
  },
  entry: {
    cli: "src/cli/main.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  treeshake: true,
});
