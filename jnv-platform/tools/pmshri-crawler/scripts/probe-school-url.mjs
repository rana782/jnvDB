import { chromium } from "playwright";

const udise = "10082102005";
const paths = [
  `https://pmshri.education.gov.in/school/${udise}`,
  `https://pmshri.education.gov.in/schools/${udise}`,
  `https://pmshri.education.gov.in/school-details/${udise}`,
  `https://pmshri.education.gov.in/pmshri-school/${udise}`,
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const p of paths) {
  const res = await page.goto(p, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => null);
  const url = page.url();
  const hasReport = await page.getByText(/report card/i).count().catch(() => 0);
  console.log(p, "->", url, "status", res?.status(), "report?", hasReport);
}
await browser.close();
