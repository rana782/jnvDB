import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(120_000);
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const state = page.locator("#statedd");
const dist = page.locator("#distdd");

const states = await state.locator("option").allTextContents();
console.log("State options:", states.length, states.slice(0, 5));

await state.selectOption({ index: 2 });
await page.waitForTimeout(8000);

const dists = await dist.locator("option").allTextContents();
console.log("District options after state:", dists.length, dists.slice(0, 15));

const body = await page.content();
console.log("Has school table/list markers:", /Know More|know more|UDISE|school/i.test(await page.innerText("body")));

await browser.close();
