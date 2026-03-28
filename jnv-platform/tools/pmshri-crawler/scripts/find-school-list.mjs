import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
let i = 0;
while ((i = s.indexOf("/school/", i + 1)) !== -1) {
  console.log(s.slice(i, i + 120));
}
