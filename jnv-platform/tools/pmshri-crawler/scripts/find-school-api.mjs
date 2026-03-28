import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
const parts = s.split("apipmshridashboard");
console.log(
  "chunks",
  parts.length,
  parts
    .slice(1, 40)
    .map((p) => p.slice(0, 80))
    .join("\n---\n"),
);
