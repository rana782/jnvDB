import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
const needles = ["Report Card", "reportcard", "report_card", "pdf", "school/detail"];
for (const n of needles) {
  let i = 0;
  let c = 0;
  while ((i = s.toLowerCase().indexOf(n.toLowerCase(), i + 1)) !== -1 && c < 3) {
    console.log("\n==", n, c, "==\n", s.slice(i - 60, i + n.length + 100));
    c++;
  }
}
