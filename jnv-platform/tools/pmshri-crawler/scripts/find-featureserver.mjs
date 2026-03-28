import fs from "fs";
import path from "path";
import os from "os";

const s = fs.readFileSync(path.join(os.tmpdir(), "pmshri-main.js"), "utf8");
const re = /https:\/\/[^"'`\s]+FeatureServer[^"'`\s]*/g;
const u = new Set(s.match(re) || []);
console.log([...u].join("\n"));
