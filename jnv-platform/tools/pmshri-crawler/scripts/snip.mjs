import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
const keys = ["distdd", "statedd", "filterwisedata", "district", "getstate"];
for (const k of keys) {
  let i = 0;
  let n = 0;
  while ((i = s.indexOf(k, i)) !== -1 && n < 3) {
    console.log("\n---", k, n, "---\n", s.slice(i - 100, i + 250));
    i += k.length;
    n++;
  }
}
