import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const payload = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch (e) {
    if (e.code === "EPERM" || e.code === "EBUSY" || e.code === "ENOENT") {
      await fs.writeFile(file, payload, "utf8");
    } else {
      throw e;
    }
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/**
 * Save or merge a school record by udise_code (dedupe).
 * @param {object} record — must include udise_code (or fallback key in school_name+state+district)
 */
export async function saveSchoolRecord(record) {
  const file = config.paths.schoolsJson;
  const list = await readJson(file, []);
  const key = record.udise_code || `${record.school_name}|${record.district}|${record.state}`;
  const idx = list.findIndex(
    (r) =>
      (r.udise_code && r.udise_code === record.udise_code) ||
      (!record.udise_code &&
        r.school_name === record.school_name &&
        r.district === record.district &&
        r.state === record.state)
  );
  const merged = {
    ...record,
    _dedupe_key: key,
    timestamp: record.timestamp || new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...merged };
  else list.push(merged);
  await writeJsonAtomic(file, list);
  return merged;
}

export async function saveFailedSchool(entry) {
  const file = config.paths.failedJson;
  const list = await readJson(file, []);
  const key = entry.key || entry.udise_code || `${entry.school_name}|${entry.district}|${entry.state}`;
  const idx = list.findIndex((r) => r.key === key);
  const row = {
    ...entry,
    key,
    timestamp: new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  await writeJsonAtomic(file, list);
}

export async function loadSchoolsIndex() {
  return readJson(config.paths.schoolsJson, []);
}

export async function loadFailedIndex() {
  return readJson(config.paths.failedJson, []);
}
