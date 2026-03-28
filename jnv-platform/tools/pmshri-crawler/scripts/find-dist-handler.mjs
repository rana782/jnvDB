import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
for (const needle of ['#distdd").on("change"', "#distdd\").on(\"change", "distdd\").on"]) {
  const i = s.indexOf(needle);
  if (i !== -1) {
    console.log("found", needle, "at", i);
    console.log(s.slice(Math.max(0, i - 150), i + 1500));
    break;
  }
}
