import type { ReportCardNormalized } from "../report-card-normalized.js";
import { firstIntInPatterns, num } from "./text-helpers.js";

type DigitalValues = ReportCardNormalized["digital"];

function emptyDigital(): DigitalValues {
  return {
    desktops: null,
    laptops: null,
    tablets: null,
    printers: null,
    projectors: null,
    smartClassTv: null,
  };
}

const DIGITAL_SECTION_RE =
  /ICT|digital\s*facilities|computer\s*facility|educational\s*technology|IT\s*assets|hardware/i;

function digitalSectionWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(DIGITAL_SECTION_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  return { window: blob.slice(m.index, m.index + 3200), anchored: true };
}

/**
 * Desktop/laptop/tablet/printer/projector/smart-class counts — keyword + `Label : N` / table tails.
 */
export function extractDigitalFromReportCard(text: string): {
  digital: DigitalValues;
  digitalConfidence: number;
  sectionPresent: boolean;
} {
  const values = emptyDigital();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = digitalSectionWindow(blob);
  const sectionPresent = anchored;

  const apply = (key: keyof DigitalValues, patterns: RegExp[]) => {
    if (values[key] != null) return;
    const n = firstIntInPatterns(window, patterns) ?? firstIntInPatterns(blob, patterns);
    if (n != null) values[key] = n;
  };

  apply("desktops", [
    /\bDesktops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bDesktop\s*Computers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bPCs?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  apply("laptops", [/\bLaptops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i, /\bNotebooks?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("tablets", [/\bTablets?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("printers", [/\bPrinters?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("smartClassTv", [
    /\bSmart\s*Class(?:room)?\s*(?:TV|Kit|Units?)\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bSmart\s*Class\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  apply("projectors", [
    /\bProjectors?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bLCD\s*(?:Projectors?|Panels?)\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);

  const anchorIdx = lines.findIndex((l) => DIGITAL_SECTION_RE.test(l));
  const start = anchorIdx >= 0 ? anchorIdx : 0;
  const end = Math.min(start + 50, lines.length);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const smart = line.match(
      /\bSmart\s*Class(?:room)?\s*(?:TV|Kit|Units?)?\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (smart && values.smartClassTv == null) {
      const n = num(smart[1]);
      if (n != null) values.smartClassTv = n;
      continue;
    }
    const tail = line.match(
      /\b(Desktops?|Laptops?|Tablets?|Printers?|Projectors?|PCs?)\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (tail) {
      const lab = tail[1].toLowerCase();
      const n = num(tail[2]);
      if (n == null) continue;
      if ((lab === "desktop" || lab === "desktops") && values.desktops == null) values.desktops = n;
      else if ((lab === "laptop" || lab === "laptops") && values.laptops == null) values.laptops = n;
      else if ((lab === "tablet" || lab === "tablets") && values.tablets == null) values.tablets = n;
      else if ((lab === "printer" || lab === "printers") && values.printers == null) values.printers = n;
      else if ((lab === "projector" || lab === "projectors") && values.projectors == null) {
        values.projectors = n;
      } else if ((lab === "pc" || lab === "pcs") && values.desktops == null) values.desktops = n;
    }
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 6) * 0.45;
  if (filled >= 2) confidence += 0.08;
  if (anchored && filled >= 1) confidence += 0.07;

  return { digital: values, digitalConfidence: Math.min(0.9, confidence), sectionPresent };
}

export function digitalHasData(v: DigitalValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}
