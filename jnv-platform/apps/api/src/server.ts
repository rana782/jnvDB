import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
