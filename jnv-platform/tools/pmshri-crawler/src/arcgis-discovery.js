/**
 * Discover JNV / Navodaya PM SHRI schools from the official webgis feature layer
 * (same data the GIS map uses). No pagination params — server returns full result set per query.
 *
 * India has ~660 JNVs overall; the pmshree layer only includes PM SHRI schools (~13k total).
 * NVS/JNV in that layer: use schmgt=93 (matches UDISE `sch_mgmt_center_id` 93) → 611 schools.
 * A name-only filter (NAVODAYA/JNV/…) matched only ~548 and missed ~63 abbreviated/typo names (J.N.V., NAVODYA, etc.).
 */
const PMSHREE_QUERY =
  "https://webgis.nic.in/publishing/rest/services/misc/pmshree/MapServer/0/query";

/**
 * All Navodaya Vidyalaya Samiti schools in the PM SHRI ArcGIS layer (one HTTP call).
 * @returns {Promise<{ udise_code: string, school_name: string, lgd_district_id: number, lgd_state_id: number, latitude: number, longitude: number, state_label: string }[]>}
 */
export async function queryAllNvsPmshriSchools() {
  const where = "schmgt=93";
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields: "udise_sch_,schname,lgd_distri,lgd_state_,latitude,longitude,stname",
    returnGeometry: "false",
  });
  const url = `${PMSHREE_QUERY}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS ${res.status}: NVS query`);
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  const features = j.features || [];
  return features.map((f) => {
    const a = f.attributes || {};
    const u = a.udise_sch_;
    let udise = u != null ? String(Math.round(Number(u))) : "";
    if (udise.length > 0 && udise.length < 11) udise = udise.padStart(11, "0");
    const st = (a.stname || "").trim();
    return {
      udise_code: udise,
      school_name: a.schname || "",
      lgd_district_id: a.lgd_distri,
      lgd_state_id: a.lgd_state_,
      latitude: a.latitude,
      longitude: a.longitude,
      state_label: st || `LGD state ${a.lgd_state_}`,
    };
  });
}

/** @param {number} stateLgd — legacy per-state name match (narrower than {@link queryAllNvsPmshriSchools}) */
export async function queryJnvSchoolsForState(stateLgd) {
  const where = `lgd_state_=${stateLgd} AND (UPPER(schname) LIKE '%NAVODAYA%' OR UPPER(schname) LIKE '%JNV%' OR UPPER(schname) LIKE '%JAWAHAR%' OR UPPER(schname) LIKE '%JAWARHAR%')`;
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields: "udise_sch_,schname,lgd_distri,lgd_state_,latitude,longitude",
    returnGeometry: "false",
  });
  const url = `${PMSHREE_QUERY}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS ${res.status}: ${stateLgd}`);
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  const features = j.features || [];
  return features.map((f) => {
    const a = f.attributes || {};
    const u = a.udise_sch_;
    let udise = u != null ? String(Math.round(Number(u))) : "";
    if (udise.length > 0 && udise.length < 11) udise = udise.padStart(11, "0");
    return {
      udise_code: udise,
      school_name: a.schname || "",
      lgd_district_id: a.lgd_distri,
      lgd_state_id: a.lgd_state_,
      latitude: a.latitude,
      longitude: a.longitude,
    };
  });
}

/**
 * Load state code list from GIS page (#statedd option values).
 * @param {import('playwright').Page} page
 * @returns {Promise<{ label: string, lgd: number }[]>}
 */
export async function loadGisStateOptions(page) {
  await page.goto("https://pmshri.education.gov.in/gis/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(4000);
  return page.locator("#statedd option").evaluateAll((opts) =>
    opts
      .map((o) => ({
        label: (o.textContent || "").trim(),
        lgd: Number(o.value),
      }))
      .filter((x) => x.label && !/^select/i.test(x.label) && Number.isFinite(x.lgd) && x.lgd > 0),
  );
}
