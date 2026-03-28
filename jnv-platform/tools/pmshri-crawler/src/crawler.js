import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch (e) {
    if (e.code === "EPERM" || e.code === "EBUSY") {
      await fs.writeFile(file, payload, "utf8");
    } else {
      throw e;
    }
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

const defaultProgress = {
  stateIndex: 0,
  districtIndex: 0,
  schoolIndex: 0,
  lastState: null,
  lastDistrict: null,
  lastUdise: null,
  arcgis_state_index: 0,
  arcgis_school_index: 0,
  updatedAt: null,
};

export async function resumeScraper() {
  try {
    const raw = await fs.readFile(config.paths.progressJson, "utf8");
    return { ...defaultProgress, ...JSON.parse(raw) };
  } catch {
    return { ...defaultProgress };
  }
}

export async function saveProgress(partial) {
  const cur = await resumeScraper();
  const next = { ...cur, ...partial, updatedAt: new Date().toISOString() };
  await writeJson(config.paths.progressJson, next);
  return next;
}

function skipPlaceholder(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 2) return true;
  return /^(select|choose|--|all\s+states?|state\s*\*|district)/i.test(t);
}

function isLanguageSelectOptions(options) {
  const lower = options.map((o) => o.toLowerCase());
  const hasEn = lower.some((o) => o === "english");
  const hasHi = lower.some((o) => /hindi|हिन्दी/.test(o));
  return hasEn && hasHi && options.length <= 6;
}

/** PM SHRI portal uses these IDs (seen in production DOM). */
async function resolvePmshriSelects(page) {
  const stateSel = page.locator("#map_state_name");
  const distSel = page.locator("#map_district_name");
  if ((await stateSel.count()) === 0) return null;
  let langSel = null;
  const all = page.locator("select");
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const s = all.nth(i);
    const id = await s.getAttribute("id");
    if (id === "map_state_name" || id === "map_district_name") continue;
    const texts = (await s.locator("option").allTextContents()).map((t) => t.trim()).filter(Boolean);
    if (isLanguageSelectOptions(texts)) {
      langSel = s;
      break;
    }
  }
  return { langSel, stateSel, distSel };
}

export async function detectSelectLayout(page) {
  const pm = await resolvePmshriSelects(page);
  if (pm) return { kind: "pmshri", ...pm };

  const selects = page.locator("select");
  const n = await selects.count();
  if (n === 0) return { kind: "generic", languageIdx: null, stateIdx: 0, districtIdx: 1 };

  const optionSets = [];
  for (let i = 0; i < n; i++) {
    const texts = (await selects.nth(i).locator("option").allTextContents())
      .map((t) => t.trim())
      .filter(Boolean);
    optionSets.push(texts);
  }

  let languageIdx = null;
  for (let i = 0; i < optionSets.length; i++) {
    if (isLanguageSelectOptions(optionSets[i])) {
      languageIdx = i;
      break;
    }
  }

  if (languageIdx !== null && n >= 3) {
    return { kind: "generic", languageIdx, stateIdx: languageIdx + 1, districtIdx: languageIdx + 2 };
  }
  return { kind: "generic", languageIdx, stateIdx: 0, districtIdx: 1 };
}

async function waitForAppShell(page) {
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector("body", { state: "attached", timeout: 60_000 });
  await delay(config.delays.pageLoad);
  for (const sel of ["#map_state_name", "main", "select", "[role=combobox]"]) {
    try {
      await page.waitForSelector(sel, { state: "visible", timeout: 20_000 });
      break;
    } catch {
      /* next */
    }
  }
}

async function optionTextsFromLocator(selectLocator) {
  const opts = selectLocator.locator("option");
  const texts = await opts.allTextContents();
  return [...new Set(texts.map((t) => t.trim()).filter((t) => !skipPlaceholder(t)))];
}

async function optionTextsFromSelectNth(page, selectIndex) {
  const selects = page.locator("select");
  const n = await selects.count();
  if (selectIndex >= n) return [];
  return optionTextsFromLocator(selects.nth(selectIndex));
}

async function readListboxOptions(page) {
  const listbox = page.locator("[role=listbox]");
  if (!(await listbox.first().isVisible().catch(() => false))) return [];
  return listbox.first().locator("[role=option]").allTextContents();
}

export async function ensureEnglishIfNeededOnPage(page, layout) {
  if (layout.kind === "pmshri" && layout.langSel) {
    await selectNativeByLabel(layout.langSel, "English");
    await delay(config.delays.afterSelect);
    return;
  }
  if (layout.kind === "generic" && layout.languageIdx !== null) {
    const selects = page.locator("select");
    await selectNativeByLabel(selects.nth(layout.languageIdx), "English");
    await delay(config.delays.afterSelect);
  }
}

/** Select <option> by matching visible text; prefers `value` attribute for stability. */
export async function selectNativeByLabel(selectLocator, wanted) {
  const w = wanted.trim();
  const wLower = w.toLowerCase();
  const pairs = await selectLocator.locator("option").evaluateAll((els) =>
    els.map((o) => ({ text: (o.textContent || "").trim(), value: o.value })),
  );
  let pick = pairs.find((p) => p.text.toLowerCase() === wLower);
  if (!pick) pick = pairs.find((p) => p.text.toLowerCase().includes(wLower));
  if (!pick) pick = pairs.find((p) => wLower.includes(p.text.toLowerCase()) && p.text.length > 2);
  if (!pick) throw new Error(`Option not found for: "${wanted}"`);
  if (pick.value !== undefined && pick.value !== "") {
    await selectLocator.selectOption({ value: pick.value });
  } else {
    await selectLocator.selectOption({ label: pick.text });
  }
}

export async function getStatesAndDistricts(page, { useCache = true } = {}) {
  const cachePath = path.join(config.paths.data, "states_districts.json");
  if (useCache && process.env.REFRESH_DISTRICTS !== "1") {
    try {
      const raw = await fs.readFile(cachePath, "utf8");
      const cached = JSON.parse(raw);
      if (Array.isArray(cached) && cached.length) {
        const bad = cached.some((r) => /^(english|हिन्दी|hindi)$/i.test(String(r.state || "").trim()));
        if (!bad && cached[0]?.districts?.length > 1) {
          console.log("[crawler] Using cached states_districts.json");
          return cached;
        }
        console.log("[crawler] Rebuilding states/districts cache…");
      }
    } catch {
      /* no cache */
    }
  }

  await waitForAppShell(page);
  const layout = await detectSelectLayout(page);
  await ensureEnglishIfNeededOnPage(page, layout);

  const result = [];

  if (layout.kind === "pmshri") {
    const { stateSel, distSel } = layout;
    const stateTexts = await optionTextsFromLocator(stateSel);
    const waitDistrict = config.delays.afterSelect * 2;

    for (const state of stateTexts) {
      try {
        await selectNativeByLabel(stateSel, state);
        await delay(waitDistrict);
        await distSel.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
        const districts = await optionTextsFromLocator(distSel);
        console.log(`State → District: ${state} → ${districts.length} districts`);
        result.push({ state, districts });
      } catch (e) {
        console.warn(`[crawler] Skip state "${state}": ${e.message}`);
      }
    }
    await writeJson(cachePath, result);
    return result;
  }

  const selects = page.locator("select");
  const nSel = await selects.count();
  if (nSel > 0) {
    const { stateIdx, districtIdx } = layout;
    const stateTexts = await optionTextsFromSelectNth(page, stateIdx);
    const districtSelectExists = districtIdx < nSel && districtIdx !== stateIdx;
    const waitDistrict = config.delays.afterSelect * 2;

    for (const state of stateTexts) {
      try {
        await selectNativeByLabel(selects.nth(stateIdx), state);
        await delay(waitDistrict);
        let districts = [];
        if (districtSelectExists) {
          districts = await optionTextsFromSelectNth(page, districtIdx);
        }
        console.log(`State → District: ${state} → ${districts.length} districts`);
        result.push({ state, districts });
      } catch (e) {
        console.warn(`[crawler] Skip state "${state}": ${e.message}`);
      }
    }
    await writeJson(cachePath, result);
    return result;
  }

  const combo = page.getByRole("combobox").first();
  if (await combo.isVisible().catch(() => false)) {
    await combo.click();
    await delay(400);
    let stateOptions = await readListboxOptions(page);
    await page.keyboard.press("Escape").catch(() => {});
    if (!stateOptions.length) stateOptions = await page.locator("[role=option]").allTextContents();
    const states = [...new Set(stateOptions.map((t) => t.trim()).filter((t) => !skipPlaceholder(t)))];
    for (const state of states) {
      await combo.click();
      await delay(300);
      await page.getByRole("option", { name: state, exact: true }).click().catch(async () => {
        await page.getByText(state, { exact: true }).first().click();
      });
      await delay(config.delays.afterSelect * 2);
      const distCombo = page.getByRole("combobox").nth(1);
      let districts = [];
      if (await distCombo.isVisible().catch(() => false)) {
        await distCombo.click();
        await delay(400);
        const dOpts = await readListboxOptions(page);
        await page.keyboard.press("Escape").catch(() => {});
        districts = [...new Set(dOpts.map((t) => t.trim()).filter((t) => !skipPlaceholder(t)))];
      }
      console.log(`State → District: ${state} → ${districts.length} districts`);
      result.push({ state, districts });
    }
    if (result.length) {
      await writeJson(cachePath, result);
      return result;
    }
  }

  console.warn("[crawler] Could not auto-detect state/district controls.");
  await writeJson(cachePath, result);
  return result;
}

export async function goToStatePage(page) {
  await waitForAppShell(page);
}

export async function selectStateAndDistrict(page, state, district) {
  await goToStatePage(page);
  const layout = await detectSelectLayout(page);
  await ensureEnglishIfNeededOnPage(page, layout);
  const waitDistrict = config.delays.afterSelect * 2;

  if (layout.kind === "pmshri") {
    const { stateSel, distSel } = layout;
    await selectNativeByLabel(stateSel, state);
    await delay(waitDistrict);
    await selectNativeByLabel(distSel, district);
    await delay(config.delays.afterSelect);
    return;
  }

  const selects = page.locator("select");
  const nSel = await selects.count();
  if (nSel > 0) {
    const { stateIdx, districtIdx } = layout;
    await selectNativeByLabel(selects.nth(stateIdx), state);
    await delay(waitDistrict);
    if (districtIdx < nSel) {
      await selectNativeByLabel(selects.nth(districtIdx), district);
    }
    await delay(config.delays.afterSelect);
    return;
  }

  const c0 = page.getByRole("combobox").first();
  await c0.click();
  await delay(300);
  await page.getByRole("option", { name: state, exact: true }).click().catch(async () => {
    await page.getByText(state, { exact: true }).first().click();
  });
  await delay(waitDistrict);
  const c1 = page.getByRole("combobox").nth(1);
  if (await c1.isVisible().catch(() => false)) {
    await c1.click();
    await delay(300);
    await page.getByRole("option", { name: district, exact: true }).click().catch(async () => {
      await page.getByText(district, { exact: true }).first().click();
    });
    await delay(config.delays.afterSelect);
  }
}
