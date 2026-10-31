import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Regression tests are deterministic even when .env.local connects the developer to Supabase.
  define: mode === "test"
    ? { "import.meta.env.VITE_APP_MODE": JSON.stringify("demo") }
    : {},
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  build: { chunkSizeWarningLimit: 750 },
}));
