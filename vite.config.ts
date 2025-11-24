import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 3000,
  },
  preview: {
    // Bind preview server to the platform PORT when available and allow the
    // production host used by Railway to access the preview server.
    host: true,
    port: Number(process.env.PORT) || 4173,
    allowedHosts: [
      'mira-production-4ba9.up.railway.app',
      'localhost',
      '127.0.0.1'
    ],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer",
    },
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  publicDir: "public", // Ensure public directory is served
});
