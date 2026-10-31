import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/canvas/**/*.test.ts", "tests/social/**/*.test.ts", "tests/editor/**/*.test.ts", "tests/inbox/**/*.test.ts"],
    env: { ENCRYPTION_KEY: "test-only-encryption-key-0123456789" },
    environment: "node",
  },
});
