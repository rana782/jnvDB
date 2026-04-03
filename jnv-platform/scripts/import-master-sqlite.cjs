/**
 * Local SQLite: load jnv_pipeline/output/JNV_bulk_import_ready_MASTER.xlsx into
 * apps/api/prisma/dev.db, then reconcile map/dashboard KPIs.
 *
 * Run from jnv-platform root: npm run data:import-sqlite
 *
 * Requires Python 3 + jnv_pipeline/requirements.txt (pandas, openpyxl).
 * Override interpreter: set PYTHON (full path or command name).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const platformRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(platformRoot, "..");
const pyScript = path.join(repoRoot, "jnv_pipeline", "import_master_to_dev_db.py");
const masterXlsx = path.join(repoRoot, "jnv_pipeline", "output", "JNV_bulk_import_ready_MASTER.xlsx");

if (!fs.existsSync(pyScript)) {
  console.error("Missing:", pyScript);
  process.exit(1);
}
if (!fs.existsSync(masterXlsx)) {
  console.error("Missing master workbook:\n ", masterXlsx);
  console.error("Add JNV_bulk_import_ready_MASTER.xlsx under jnv_pipeline/output/ (see jnv_pipeline/README.md).");
  process.exit(1);
}

function runPython() {
  const attempts = [];
  if (process.env.PYTHON?.trim()) {
    attempts.push([process.env.PYTHON.trim(), [pyScript]]);
  }
  attempts.push(["python", [pyScript]]);
  attempts.push(["python3", [pyScript]]);
  if (process.platform === "win32") {
    attempts.push(["py", ["-3", pyScript]]);
  }

  let last;
  for (const [cmd, args] of attempts) {
    last = spawnSync(cmd, args, {
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
    "Could not run Python. Install Python 3, pip install -r jnv_pipeline/requirements.txt, or set PYTHON to your interpreter.",
  );
  process.exit(last?.status ?? 1);
}

function runReconcile() {
  // shell: true — required on Windows (spawn npm without shell often returns EINVAL).
  const r = spawnSync("npm", ["run", "dev:reconcile-dashboard", "-w", "@jnv/api"], {
    stdio: "inherit",
    cwd: platformRoot,
    env: {
      ...process.env,
      DATABASE_URL: "file:./dev.db",
    },
    shell: true,
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runPython();
runReconcile();
console.log("Done. SQLite dev.db updated and dashboard/map reconciled.");
