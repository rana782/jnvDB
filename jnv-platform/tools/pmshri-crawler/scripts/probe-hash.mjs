import { chromium } from "playwright";

const urls = [
  "https://pmshri.education.gov.in/gis/#/school/4647",
  "https://pmshri.education.gov.in/gis/#/schooldetails/4647",
  "https://pmshri.education.gov.in/gis/#/details/10082102005",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const u of urls) {
  await page.goto(u, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const has = await page.getByText(/report|know more|school name/i).count();
  const body = (await page.innerText("body")).slice(0, 500);
  console.log(u, "->", page.url(), "matches", has, body.replace(/\s+/g, " ").slice(0, 200));
}
await browser.close();
