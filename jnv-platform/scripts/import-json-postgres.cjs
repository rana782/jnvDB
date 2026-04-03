/**
 * One-time static JSON -> PostgreSQL ingestion.
 * Run from jnv-platform root: npm run data:import-postgres-json
 *
 * Requires:
 * - DATABASE_URL (Postgres)
 * - Python deps from jnv_pipeline/requirements.txt
 */
const path = require("path");
const { spawnSync } = require("child_process");

const platformRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(platformRoot, "..");

function runPython() {
  const passthrough = process.argv.slice(2);
  const args = ["-m", "jnv_pipeline.import_json_to_postgres", ...passthrough];
  const attempts = [];
  if (process.env.PYTHON?.trim()) attempts.push([process.env.PYTHON.trim(), args]);
  attempts.push(["python", args]);
  attempts.push(["python3", args]);
  if (process.platform === "win32") attempts.push(["py", ["-3", ...args]]);

  let last;
  for (const [cmd, argv] of attempts) {
    last = spawnSync(cmd, argv, {
      stdio: "inherit",
      cwd: repoRoot,
      env: process.env,
      shell: false,
    });
    if (last.status === 0) return;
    if (last.error?.code === "ENOENT") continue;
    process.exit(last.status ?? 1);
  }
  console.error(
    "Could not run Python. Install Python 3, pip install -r jnv_pipeline/requirements.txt, or set PYTHON.",
  );
  process.exit(last?.status ?? 1);
}

runPython();
