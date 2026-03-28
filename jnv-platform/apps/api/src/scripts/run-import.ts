import { loadEnv } from "../config/env.js";
import { resolveScrapedDataPaths } from "../config/paths.js";
import { runPdfImport } from "../modules/import/ingest.service.js";

async function main() {
  const env = loadEnv();
  const paths = resolveScrapedDataPaths(env);
  const force = process.argv.includes("--force");
  const { jobId } = await runPdfImport({ paths, repoRoot: paths.repoRoot, force });
  console.log("Import finished. Job id:", jobId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
