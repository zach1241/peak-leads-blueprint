// Local-only SQL checks; use the existing Supabase PostgreSQL container.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/tests/recurring-assignments.sql", import.meta.url), "utf8");
const expected = (sql.match(/^select pg_temp\.(check|reject)\(/gm) || []).length;
const result = execFileSync("docker", ["exec", "-i", process.env.RECURRING_TEST_CONTAINER || "supabase_db_peak-leads-blueprint", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8", maxBuffer: 2e6 });
const passed = result.split("\n").filter(line => line.startsWith("PASS: "));
assert.equal(passed.length, expected, "Every planned recurring assignment check must execute");
console.log(passed.join("\n"));
console.log(`PASS ${passed.length} recurring assignment checks; all fixtures rolled back.`);
