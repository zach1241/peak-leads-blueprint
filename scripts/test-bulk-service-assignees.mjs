// Local-only rollback SQL checks; no hosted credentials are read.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/tests/bulk-service-assignments.sql", import.meta.url), "utf8");
const expected = (sql.match(/^select pg_temp\.(check|reject)\(/gm) || []).length;
const result = execFileSync("docker", ["exec", "-i", process.env.BULK_ASSIGNMENT_TEST_CONTAINER || "supabase_db_peak-leads-blueprint", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8", maxBuffer: 2e6 });
const passed = result.split("\n").filter((line) => line.startsWith("PASS: "));
assert.equal(passed.length, expected, "Every planned bulk assignment check must execute");
console.log(passed.join("\n"));
console.log(`PASS ${passed.length} bulk service assignment checks; all fixtures rolled back.`);
