// Runs tests/db/security.sql against the LOCAL Supabase database with psql.
// Usage: npm run test:db   (override the target with DATABASE_URL=...)
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.ALLOW_REMOTE_DB_TESTS !== "1") {
  console.error("Refusing to run database tests against a non-local database.");
  process.exit(1);
}
const result = spawnSync(
  "psql",
  [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", "tests/db/security.sql"],
  {
    stdio: "inherit",
    shell: false,
  },
);
if (result.error) {
  console.error(
    `Could not run psql: ${result.error.message}. Install the PostgreSQL client tools.`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
