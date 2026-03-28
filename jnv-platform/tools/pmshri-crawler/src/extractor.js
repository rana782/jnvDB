import { config } from "../config.js";
import { delay } from "./crawler.js";

export const JNV_ALIASES = [
  "jnv",
  "nvs",
  "jawahar navodaya",
  "navodaya vidyalaya",
  "jawahar navodaya vidyalaya",
  "navodaya vidyalaya samiti",
];

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
}

function isJnvText(text) {
  const n = normalize(text);
  if (!n) return false;
  return JNV_ALIASES.some((a) => n.includes(a));
}

/**
 * Find all "Know More" controls whose surrounding card/list row mentions JNV.
 * @returns {{ found: boolean, rows: import("playwright").Locator[] }} rows = clickable Know More locators
 */
export async function findJNVInDistrict(page) {
  await delay(config.delays.action);

  const linkLoc = page.getByRole("link", { name: /know\s*more/i });
  const btnLoc = page.getByRole("button", { name: /know\s*more/i });
  const nLinks = await linkLoc.count();
  const nBtns = await btnLoc.count();

  const rows = [];
  const seen = new Set();

  async function considerCollection(collection, total) {
    for (let i = 0; i < total; i++) {
      const el = collection.nth(i);
      const text = await el
        .evaluate((node) => {
          const card =
            node.closest("[class*='card' i], [class*='Card' i], article, tr, [class*='MuiPaper' i], [class*='MuiGrid' i]");
          const scope = card || node.parentElement?.parentElement?.parentElement || node.parentElement;
          return scope ? scope.innerText : "";
        })
        .catch(() => "");

      if (!isJnvText(text)) continue;
      const key = text.slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(el);
    }
  }

  await considerCollection(linkLoc, nLinks);
  if (!rows.length) await considerCollection(btnLoc, nBtns);

  if (rows.length) {
    console.log("[✔] JNV found in district");
    return { found: true, rows };
  }
  console.log("[✘] No JNV");
  return { found: false, rows: [] };
}

/**
 * @param {import("playwright").Page} page
 * @param {import("playwright").Locator} knowMoreLocator — link or button from findJNVInDistrict
 */
export async function openSchoolDetail(page, knowMoreLocator) {
  await knowMoreLocator.scrollIntoViewIfNeeded().catch(() => {});
  await delay(300);

  const clickAndSettle = async () => {
    await knowMoreLocator.click({ timeout: 45_000, force: true });
    await page.waitForLoadState("domcontentloaded");
    await delay(config.delays.pageLoad);
  };

  try {
    await clickAndSettle();
  } catch {
    await knowMoreLocator.click({ timeout: 45_000, force: true });
    await page.waitForLoadState("domcontentloaded");
    await delay(config.delays.pageLoad);
  }

  await page.waitForSelector("body", { state: "visible" });
}

function pickLabeledValue(page, labels) {
  return async () => {
    for (const label of labels) {
      const row = page.locator(`tr:has-text("${label}")`).first();
      if (await row.isVisible().catch(() => false)) {
        const txt = await row.innerText().catch(() => "");
        const parts = txt.split(/\t|\n/).map((s) => s.trim()).filter(Boolean);
        const idx = parts.findIndex((p) => new RegExp(label, "i").test(p));
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
        return txt.replace(new RegExp("^.*?" + label + "[\\s:.-]*", "i"), "").trim();
      }
      const dt = page.locator(`dt:has-text("${label}")`).first();
      if (await dt.isVisible().catch(() => false)) {
        const dd = dt.locator("xpath=following-sibling::dd[1]");
        return (await dd.innerText().catch(() => "")).trim();
      }
      const generic = page.getByText(new RegExp(label, "i")).first();
      if (await generic.isVisible().catch(() => false)) {
        const handle = await generic.elementHandle();
        if (handle) {
          const text = await page.evaluate((el) => {
            const p = el.parentElement;
            return p ? p.innerText : el.innerText;
          }, handle);
          return text.replace(new RegExp(label, "i"), "").replace(/^[:\s-]+/, "").trim();
        }
      }
    }
    return "";
  };
}

export async function extractSchoolData(page) {
  const get = async (name, finder) => {
    const v = await finder();
    if (!v || !String(v).trim()) console.warn("[extractor] Missing field: " + name);
    return (v && String(v).trim()) || "";
  };

  const school_name = await get(
    "school_name",
    async () => {
      const h = page.locator("h1, h2, h3").first();
      if (await h.isVisible().catch(() => false)) return h.innerText();
      const t = page.locator('[class*="title" i]').first();
      if (await t.isVisible().catch(() => false)) return t.innerText();
      return "";
    },
  );

  const udise_code = await get(
    "udise_code",
    pickLabeledValue(page, ["UDISE Code", "UDISE", "Udise Code"]),
  );

  const state = await get("state", pickLabeledValue(page, ["State", "State Name"]));
  const district = await get("district", pickLabeledValue(page, ["District", "District Name"]));
  const address = await get("address", pickLabeledValue(page, ["Address", "Location"]));
  const internet = await get(
    "internet availability",
    pickLabeledValue(page, ["Internet", "Internet Availability", "ICT"]),
  );
  const electricity = await get(
    "electricity availability",
    pickLabeledValue(page, ["Electricity", "Electricity Availability", "Power"]),
  );

  return {
    school_name,
    udise_code,
    state,
    district,
    address,
    internet_availability: internet,
    electricity_availability: electricity,
  };
}
