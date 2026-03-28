import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(8000);

const stateSel = page.locator("#statedd");
await stateSel.selectOption("10");
await stateSel.evaluate((el) => {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(12000);

const html = await page.locator("#distdd").evaluate((el) => el.innerHTML.slice(0, 3000));
console.log(html);

await browser.close();
