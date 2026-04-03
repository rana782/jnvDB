/**
 * Build jnv_pipeline/output/JNV_bulk_import_ready_MASTER.xlsx from crawler extractions.
 * Run from jnv-platform root: npm run data:build-master
 */
const path = require("path");
const { spawnSync } = require("child_process");

const platformRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(platformRoot, "..");

function runPython() {
  const args = ["-m", "jnv_pipeline.build_master_from_extractions"];
  const attempts = [];
  if (process.env.PYTHON?.trim()) {
    attempts.push([process.env.PYTHON.trim(), args]);
  }
  attempts.push(["python", args]);
  attempts.push(["python3", args]);
  if (process.platform === "win32") {
    attempts.push(["py", ["-3", ...args]]);
  }

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
