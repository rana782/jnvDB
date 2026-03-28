import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForSelector("#loader_id.d-none", { timeout: 120_000 }).catch(() => console.log("loader still visible"));
await page.waitForTimeout(5000);

await page.locator("#statedd").selectOption({ label: "Bihar" });
await page.waitForFunction(
  () => {
    const sel = document.querySelector("#distdd");
    if (!sel) return false;
    const opts = [...sel.querySelectorAll("option")];
    return opts.some((o) => o.textContent.trim().length > 2);
  },
  { timeout: 120_000 },
);

const opts = await page.locator("#distdd option").evaluateAll((els) =>
  els.map((o) => ({ t: o.textContent.trim(), v: o.value })).filter((x) => x.t.length > 1),
);
console.log("districts", opts.length, opts.slice(0, 10));

await browser.close();
