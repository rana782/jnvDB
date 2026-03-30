import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPdfInventory } from "./pdf-inventory.js";

describe("buildPdfInventory", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("dedupes same UDISE to lexicographically first path", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-inv-"));
    const a = path.join(tmp, "z", "11050300101.pdf");
    const b = path.join(tmp, "a", "11050300101.pdf");
    await fs.mkdir(path.dirname(a), { recursive: true });
    await fs.mkdir(path.dirname(b), { recursive: true });
    await fs.writeFile(a, "%PDF-1.4", "utf8");
    await fs.writeFile(b, "%PDF-1.4", "utf8");

    const inv = await buildPdfInventory(tmp, true);
    expect(inv.udiseToPdfPath.size).toBe(1);
    expect(inv.udiseToPdfPath.get("11050300101")).toBe(b);
    expect(inv.duplicatePaths).toHaveLength(1);
    expect(inv.duplicatePaths[0]!.path).toBe(a);
  });
});
