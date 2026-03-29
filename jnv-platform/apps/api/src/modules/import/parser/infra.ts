import type { ReportCardNormalized } from "../report-card-normalized.js";
import {
  firstYesNoInPatterns,
  normalizeYesNoToken,
} from "./text-helpers.js";

type InfraValues = ReportCardNormalized["infra"];

function emptyInfra(): InfraValues {
  return {
    electricity: null,
    water: null,
    internet: null,
    solar: null,
    playground: null,
    library: null,
  };
}

/** Avoid matching "Digital Facilities" — require school/basic/physical/functional or infra keywords. */
const INFRA_SECTION_RE =
  /basic\s+facilities|school\s+facilities|physical\s+facilities|functional\s+facilities|infrastructure|electricity\s+available|drinking\s+water|potable\s+water/i;

function infraSectionWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(INFRA_SECTION_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  return { window: blob.slice(m.index, m.index + 3500), anchored: true };
}

/**
 * Electricity, drinking water, internet, solar, playground, library — keyword + table-style lines; YES/NO → boolean.
 */
export function extractInfraFromReportCard(text: string): {
  infra: InfraValues;
  infraConfidence: number;
} {
  const values = emptyInfra();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = infraSectionWindow(blob);

  const apply = (key: keyof InfraValues, patterns: RegExp[]) => {
    if (values[key] != null) return;
    const v = firstYesNoInPatterns(window, patterns) ?? firstYesNoInPatterns(blob, patterns);
    if (v !== null) values[key] = v;
  };

  apply("electricity", [
    /\bElectricity\s*(?:Supply|Available|Connection)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bPower\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bElectric\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("water", [
    /\bDrinking\s*Water\s*(?:Available|Supply)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bPotable\s*Water\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bWater\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("internet", [
    /\bInternet\s*(?:Available|Facility|Connection)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bICT\s*(?:Facility|Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bBroadband\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("solar", [
    /\bSolar\s*(?:Panel|Energy|Power)?\s*(?:Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bSolar\s*PV\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("playground", [
    /\bPlayground\s*(?:Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bSports\s*(?:Ground|Facility)\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("library", [
    /\bLibrary\s*(?:Available|Facility|Room)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bReading\s*Room\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);

  const anchorIdx = lines.findIndex((l) => INFRA_SECTION_RE.test(l));
  const start = anchorIdx >= 0 ? anchorIdx : 0;
  const end = Math.min(start + 55, lines.length);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const tailM = line.match(
      /[:\-–.]?\s*(Yes|No|Y|N|1|0|Available|Not\s*available)\s*$/i,
    );
    if (!tailM) continue;
    const b = normalizeYesNoToken(tailM[1]);
    if (b === null) continue;
    const low = line.toLowerCase();
    if (values.electricity == null && /electric|power\s*supply/.test(low)) values.electricity = b;
    else if (values.water == null && /(drinking|potable)\s*water|water\s*supply/.test(low)) values.water = b;
    else if (values.internet == null && /internet|ict|broadband/.test(low)) values.internet = b;
    else if (values.solar == null && /solar/.test(low)) values.solar = b;
    else if (values.playground == null && /playground|sports\s*(ground|facility)/.test(low)) {
      values.playground = b;
    } else if (values.library == null && /library|reading\s*room/.test(low)) values.library = b;
  }

  const filled = (Object.values(values) as (boolean | null)[]).filter((x) => x !== null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 6) * 0.48;
  if (filled >= 3) confidence += 0.1;
  if (anchored && filled >= 1) confidence += 0.08;

  return { infra: values, infraConfidence: Math.min(0.9, confidence) };
}

export function infraHasData(v: InfraValues): boolean {
  return (Object.values(v) as (boolean | null)[]).some((x) => x !== null);
}
