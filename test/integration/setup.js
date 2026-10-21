// Creates the D1 tables before the tests. TEST_MIGRATIONS comes from vitest.config.js.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
