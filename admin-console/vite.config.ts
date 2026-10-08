import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// The Grademaxxing Worker serves this build as static assets under /admin-app/
// (see ../src/hooks.server.ts for the admin-host routing).
export default defineConfig({
  base: "/admin-app/",
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  plugins: [
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
