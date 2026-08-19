import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

export default defineConfig({
  root: "src/renderer",
  /** Load `.env` from the monorepo root (not `src/renderer`). */
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/renderer", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    /**
     * Mermaid ships a single parser module that minifies above the default
     * 500 kB reporter threshold; Rolldown cannot split one module further.
     */
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /[\\/]node_modules[\\/](?:react|react-dom)[\\/]/,
              priority: 20,
            },
            {
              name: "xterm",
              test: /[\\/]node_modules[\\/]@xterm[\\/]xterm[\\/]/,
              priority: 20,
            },
            {
              name: "xterm-webgl",
              test: /[\\/]node_modules[\\/]@xterm[\\/]addon-webgl[\\/]/,
              priority: 20,
            },
            {
              name: "xterm-addons",
              test: /[\\/]node_modules[\\/]@xterm[\\/]addon-(?:fit|search|web-links)[\\/]/,
              priority: 20,
            },
            {
              name: "cmdk",
              test: /[\\/]node_modules[\\/]cmdk[\\/]/,
              priority: 15,
            },
            {
              name: "lucide",
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 15,
            },
            {
              name: "radix",
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
});
