import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(8000);

const stateSel = page.locator("#statedd");
const vals = await stateSel.locator("option").evaluateAll((els) =>
  els.slice(0, 5).map((o) => ({ t: o.textContent.trim(), v: o.value })),
);
console.log("first states", vals);

const biharVal = await stateSel
  .locator("option", { hasText: "Bihar" })
  .first()
  .getAttribute("value");
console.log("bihar value", biharVal);

await stateSel.selectOption(biharVal);
await stateSel.evaluate((el) => {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});

await page.waitForTimeout(15000);

const dist = await page.locator("#distdd option").evaluateAll((els) =>
  els.map((o) => ({ t: o.textContent.trim(), v: o.value })),
);
console.log("districts count", dist.length, dist.slice(0, 8));

await browser.close();
