import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(4000);

await page.locator("#statedd").selectOption({ label: "Bihar" });
await page.waitForTimeout(10000);

const opts = await page.locator("#distdd option").evaluateAll((els) =>
  els.map((o) => ({ text: o.textContent.trim(), value: o.value })),
);
console.log(JSON.stringify(opts, null, 2));

await browser.close();
