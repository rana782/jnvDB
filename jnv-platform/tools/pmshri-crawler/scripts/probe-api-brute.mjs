import { chromium } from "playwright";

const base = "https://pmshri.education.gov.in/apipmshridashboard/api/v1";
const paths = [
  "/getstatewisedata/districtlist/10",
  "/getstatewisedata/district/10",
  "/getdistrictlist/10",
  "/district/list/10",
  "/getstatewisedata/getdistrict/10",
  "/master/district/10",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
for (const p of paths) {
  const url = base + p;
  const r = await page.evaluate(async (u) => {
    const res = await fetch(u);
    return { status: res.status, text: (await res.text()).slice(0, 200) };
  }, url);
  console.log(p, r.status, r.text);
}
await browser.close();
