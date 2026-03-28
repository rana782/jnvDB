import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(120_000);
await page.goto("https://pmshri.education.gov.in/gis", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(15000);

const info = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  selects: [...document.querySelectorAll("select")].map((s) => ({ id: s.id, name: s.name, n: s.querySelectorAll("option").length })),
  textHasJnv: /JNV|Navodaya|NVS/i.test(document.body.innerText),
  knowMore: [...document.querySelectorAll("a")].filter((a) => /know more/i.test(a.textContent)).length,
}));
console.log(JSON.stringify(info, null, 2));
console.log((await page.content()).includes("map_district") ? "has map_district in html" : "no map_district");

await browser.close();
