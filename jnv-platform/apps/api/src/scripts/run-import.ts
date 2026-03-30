import { loadEnv } from "../config/env.js";
import { resolveScrapedDataPaths } from "../config/paths.js";
import { runPdfImport } from "../modules/import/ingest.service.js";

function argAfter(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const env = loadEnv();
  const paths = resolveScrapedDataPaths(env);
  const force = process.argv.includes("--force");
  const resumeFromCheckpoint = process.argv.includes("--resume");
  const recursive = !process.argv.includes("--no-recursive");
  const checkpointFile = argAfter("--checkpoint");
  const progressRaw = argAfter("--progress-every");
  const progressEvery = progressRaw ? Number.parseInt(progressRaw, 10) : undefined;

  const { jobId } = await runPdfImport({
    paths,
    repoRoot: paths.repoRoot,
    force,
    recursive,
    checkpointFile: checkpointFile?.startsWith("-") ? undefined : checkpointFile,
    resumeFromCheckpoint,
    progressEvery: Number.isFinite(progressEvery) ? progressEvery : undefined,
  });
  console.log("Import finished. Job id:", jobId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
