import { rename } from "node:fs/promises";
import { adminConsoleCsp } from "../src/lib/server/admin/csp.ts";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// The Grademaxxing Worker serves this build as static assets under /admin-app/
// (see ../src/hooks.server.ts for the admin-host routing).
export default defineConfig({
  base: "/admin-app/",
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target:
          process.env.GRADEMAXXING_DEV_API_ORIGIN ?? "http://127.0.0.1:5173",
        changeOrigin: false,
      },
      "/fonts": {
        target:
          process.env.GRADEMAXXING_DEV_API_ORIGIN ?? "http://127.0.0.1:5173",
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  plugins: [
    {
      name: "protect-admin-shell",
      apply: "build",
      transformIndexHtml() {
        // Protect direct static-shell access as well as routed responses.
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: adminConsoleCsp.replace("; frame-ancestors 'none'", ""),
            },
            injectTo: "head",
          },
        ];
      },
      async closeBundle() {
        // An index.html lets adapter-node's static server bypass hooks at
        // /admin-app/. Serve normal navigation through the protected hook.
        await rename(
          new URL("../static/admin-app/index.html", import.meta.url),
          new URL("../static/admin-app/shell.html", import.meta.url),
        );
      },
    },
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  build: {
    outDir: "../static/admin-app",
    emptyOutDir: true,
    rolldownOptions: {
      onwarn(warning, warn) {
        // Skip eval warnings from react-jvectormap
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("@react-jvectormap")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
});
