import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
const scripts = await page.$$eval("script[src]", (els) => els.map((e) => e.src));
console.log(scripts.join("\n"));
await browser.close();
