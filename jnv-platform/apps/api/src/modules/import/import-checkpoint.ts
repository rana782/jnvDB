import fs from "node:fs/promises";
import path from "node:path";

const VERSION = 1 as const;

export type BulkImportCheckpoint = {
  version: typeof VERSION;
  /** UDISE codes successfully imported in a prior run; skipped when `resumeFromCheckpoint` is true. */
  succeededUdises: string[];
};

export async function loadBulkImportCheckpoint(filePath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    const j = JSON.parse(raw) as BulkImportCheckpoint;
    if (j?.version !== VERSION || !Array.isArray(j.succeededUdises)) return new Set();
    return new Set(j.succeededUdises.filter((u) => typeof u === "string" && /^\d{11}$/.test(u)));
  } catch {
    return new Set();
  }
}

export async function writeBulkImportCheckpoint(filePath: string, udises: ReadonlySet<string>): Promise<void> {
  const abs = path.resolve(filePath);
  const payload: BulkImportCheckpoint = {
    version: VERSION,
    succeededUdises: [...udises].filter((u) => /^\d{11}$/.test(u)).sort((a, b) => a.localeCompare(b)),
  };
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(payload, null, 2), "utf8");
}
