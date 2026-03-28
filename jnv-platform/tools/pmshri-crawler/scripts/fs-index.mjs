import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
const k = "FeatureServer";
let i = 0,
  n = 0;
while ((i = s.indexOf(k, i + 1)) !== -1 && n < 8) {
  console.log(s.slice(i - 120, i + k.length + 80));
  n++;
}
