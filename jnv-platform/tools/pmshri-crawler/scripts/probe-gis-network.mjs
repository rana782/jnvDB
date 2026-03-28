import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const urls = new Set();
page.on("request", (req) => {
  const u = req.url();
  if (/arcgis|FeatureServer|MapServer|query|token/i.test(u)) urls.add(u);
});

await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(25000);
console.log([...urls].sort().join("\n"));
await browser.close();
