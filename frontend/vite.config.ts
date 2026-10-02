import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_BACKEND_URL || env.VITE_API_URL || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react/") || id.includes("react-dom/") || id.includes("scheduler/")) {
                return "vendor-react";
              }
              if (id.includes("lucide-react")) {
                return "vendor-icons";
              }
              if (id.includes("recharts")) {
                return "vendor-ui";
              }
            }
          },
        },
      },
    },
  };
});
