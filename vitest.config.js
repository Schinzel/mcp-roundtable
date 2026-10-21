// Integration tests run in workerd with the bindings from wrangler.jsonc, locally simulated.
// The D1 migrations are read here and applied in test/integration/setup.js.
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") } },
    })),
  ],
  test: {
    include: ["test/integration/**/*.test.js"],
    setupFiles: ["test/integration/setup.js"],
  },
});
