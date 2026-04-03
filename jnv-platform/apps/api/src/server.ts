import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { assertDatabaseReachable, logDatabaseTarget } from "./shared/prisma.js";

async function main() {
  const env = loadEnv();
  logDatabaseTarget();
  try {
    await assertDatabaseReachable();
  } catch (e) {
    console.error("[db] startup check failed: cannot reach database");
    console.error(e);
    process.exit(1);
  }
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
