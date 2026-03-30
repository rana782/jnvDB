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

  // Common PM SHRI compact row style:
  // "... Internet1-YesDesktop33 ... Laptop41Tablet162Printer8 ... Projector4 ..."
  const compactRow = window.match(
    /Desktop\s*[:\-–.]?\s*(\d[\d,]*)[\s\S]{0,160}?Laptop\s*[:\-–.]?\s*(\d[\d,]*)[\s\S]{0,120}?Tablet\s*[:\-–.]?\s*(\d[\d,]*)[\s\S]{0,120}?Printer\s*[:\-–.]?\s*(\d[\d,]*)(?:[\s\S]{0,80}?Projector\s*[:\-–.]?\s*(\d[\d,]*))?/i,
  );
  if (compactRow) {
    values.desktops = values.desktops ?? num(compactRow[1]) ?? null;
    values.laptops = values.laptops ?? num(compactRow[2]) ?? null;
    values.tablets = values.tablets ?? num(compactRow[3]) ?? null;
    values.printers = values.printers ?? num(compactRow[4]) ?? null;
    values.projectors = values.projectors ?? (compactRow[5] ? num(compactRow[5]) ?? null : null);
  }

  apply("desktops", [
    /Desktop\s*[:\-–.]?\s*(\d[\d,]*)/i,
    /\bDesktops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bDesktop\s*Computers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bPCs?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  apply("laptops", [/Laptop\s*[:\-–.]?\s*(\d[\d,]*)/i, /\bLaptops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i, /\bNotebooks?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("tablets", [/Tablet\s*[:\-–.]?\s*(\d[\d,]*)/i, /\bTablets?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("printers", [/Printer\s*[:\-–.]?\s*(\d[\d,]*)/i, /\bPrinters?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("smartClassTv", [
    /\bSmart\s*Class(?:room)?\s*(?:TV|Kit|Units?)\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bSmart\s*Class\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  apply("projectors", [
    /\bProjectors?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bLCD\s*(?:Projectors?|Panels?)\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  if (values.smartClassTv == null && values.projectors != null) {
    // Most PDFs report projector count in the same digital block where smart-class units are not explicit.
    values.smartClassTv = values.projectors;
  }

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
