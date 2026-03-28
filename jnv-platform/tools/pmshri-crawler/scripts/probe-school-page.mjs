import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/school/10082102005", { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(5000);
const t = await page.innerText("body");
console.log("has Report", /report/i.test(t));
console.log("sample", t.slice(0, 2000));
await browser.close();
