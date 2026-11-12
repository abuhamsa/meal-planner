import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// In development the backend runs with AUTH_MODE=none on :8000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": process.env.API_TARGET ?? "http://localhost:8000",
    },
  },
});
