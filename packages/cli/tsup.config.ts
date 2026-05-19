import { defineConfig } from "tsup";

export default defineConfig({
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
