import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(8000);
const inputs = await page.evaluate(() =>
  [...document.querySelectorAll("input,textarea")].map((e) => ({
    type: e.type,
    id: e.id,
    name: e.name,
    ph: e.placeholder,
  })),
);
console.log(JSON.stringify(inputs, null, 2));
await browser.close();
