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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@xterm")) return "xterm";
          if (id.includes("/react-dom/") || id.includes("/react/")) return "react";
          if (id.includes("/cmdk/")) return "cmdk";
          if (id.includes("/lucide-react/")) return "lucide";
          if (id.includes("/@radix-ui/")) return "radix";
        },
      },
    },
  },
});
