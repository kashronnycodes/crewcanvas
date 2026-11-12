import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => ({
  resolve: mode === "test" ? { alias: { "npm:@supabase/supabase-js@2.80.0": "@supabase/supabase-js" } } : {},
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  build: { chunkSizeWarningLimit: 750 },
}));
