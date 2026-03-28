import fs from "fs";
import path from "path";
import os from "os";

const f = path.join(os.tmpdir(), "pmshri-main.js");
const s = fs.readFileSync(f, "utf8");
const re = /\/apipmshridashboard\/api\/v1\/[a-zA-Z0-9/?&=_-]+/g;
const set = new Set(s.match(re) || []);
console.log([...set].sort().join("\n"));
