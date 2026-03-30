import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "./env.js";

export type ScrapedDataPaths = {
  /** Absolute path to schools.json when present (optional; PDFs are source of truth) */
  schoolsJson?: string;
  /** Absolute path to PDF directory */
  pdfsDir: string;
  /** Absolute path to screenshots directory */
  screenshotsDir: string;
  /** Raw extraction JSON per UDISE (created by importer) */
  extractionsDir: string;
  /** Absolute path to jnv_udise_list.json if present */
  jnvListJson?: string;
  /** Repo root if detected */
  repoRoot?: string;
};

const LEGACY_SEGMENTS = ["pmshri-crawler", "data"] as const;
const CANONICAL_SEGMENTS = ["tools", "pmshri-crawler", "data"] as const;
const NESTED_CANONICAL_SEGMENTS = ["jnv-platform", "tools", "pmshri-crawler", "data"] as const;

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function bundleFromDataDir(dataDir: string, repoRoot: string): ScrapedDataPaths | null {
  const pdfsDir = path.join(dataDir, "pdfs");
  if (!exists(pdfsDir)) return null;
  const schoolsPath = path.join(dataDir, "schools.json");
  const shots = path.join(dataDir, "screenshots");
  const jnvList = path.join(dataDir, "jnv_udise_list.json");
  return {
    schoolsJson: exists(schoolsPath) ? schoolsPath : undefined,
    pdfsDir,
    screenshotsDir: exists(shots) ? shots : pdfsDir,
    extractionsDir: path.join(dataDir, "extractions"),
    jnvListJson: exists(jnvList) ? jnvList : undefined,
    repoRoot,
  };
}

function tryBundles(repoRoot: string): ScrapedDataPaths | null {
  const candidates = [
    path.join(repoRoot, ...CANONICAL_SEGMENTS),
    path.join(repoRoot, ...NESTED_CANONICAL_SEGMENTS),
    path.join(repoRoot, ...LEGACY_SEGMENTS),
  ];
  for (const dataDir of candidates) {
    const b = bundleFromDataDir(dataDir, repoRoot);
    if (b) return b;
  }
  return null;
}

/**
 * Walk upward from startDir looking for canonical or legacy scraped data (requires pdfs/).
 */
function discoverFrom(startDir: string): ScrapedDataPaths | null {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  for (let i = 0; i < 24 && dir !== root; i++) {
    const b = tryBundles(dir);
    if (b) return b;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Resolve scraped data paths: JNV_DATA_ROOT wins, else cwd discovery, else __dirname chain.
 */
export function resolveScrapedDataPaths(env: Env, cwd = process.cwd()): ScrapedDataPaths {
  if (env.JNV_DATA_ROOT) {
    const root = path.resolve(env.JNV_DATA_ROOT);
    const b = tryBundles(root);
    if (b) return b;
    throw new Error(
      `JNV_DATA_ROOT=${root} does not contain scraped data. Expected tools/pmshri-crawler/data/pdfs or jnv-platform/tools/pmshri-crawler/data/pdfs (or legacy pmshri-crawler/data/pdfs).`,
    );
  }

  const fromCwd = discoverFrom(cwd);
  if (fromCwd) return fromCwd;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromApi = discoverFrom(path.join(here, "..", "..", "..", ".."));
  if (fromApi) return fromApi;

  throw new Error(
    "Could not locate scraped PDF data. Set JNV_DATA_ROOT to the repo root, or run from jnv-platform with tools/pmshri-crawler/data/pdfs present.",
  );
}

/** Turn absolute path from schools.json into path relative to repo for storage */
export function toRepoRelative(absolutePath: string, repoRoot?: string): string {
  if (!repoRoot) return absolutePath;
  const rel = path.relative(repoRoot, absolutePath);
  return rel.startsWith("..") ? absolutePath : rel.split(path.sep).join("/");
}

/** All `.pdf` files under `rootDir` (recursive). Sorted for stable import order. */
export async function collectPdfFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const root = path.resolve(rootDir);

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".pdf")) {
        out.push(full);
      }
    }
  }

  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

/** PDFs directly in `pdfsDir` only (non-recursive). */
export async function listPdfFilesInRootOnly(pdfsDir: string): Promise<string[]> {
  const names = await fsPromises.readdir(pdfsDir);
  return names
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(pdfsDir, f))
    .sort((a, b) => a.localeCompare(b));
}
