// Runs against local Supabase without changing the hosted .env.local file.
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
const status = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(new URL(status.API_URL).hostname, "127.0.0.1");
const child = spawn(
  "npm",
  ["run", "dev", "--", "--port", "3001", "--hostname", "127.0.0.1"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PEAK_LOCAL_STACK: "1",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
