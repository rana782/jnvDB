import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/district|block|school|gis|api/i.test(u) && u.includes("pmshri")) {
    hits.push(u);
  }
});

await page.goto("https://pmshri.education.gov.in/gis/", { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(5000);
hits.length = 0;

await page.locator("#statedd").selectOption({ label: "Bihar" });
await page.waitForTimeout(15000);

console.log([...new Set(hits)].join("\n"));

await browser.close();
