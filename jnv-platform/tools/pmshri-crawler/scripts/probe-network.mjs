import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const reqs = [];
page.on("request", (r) => {
  if (/district|school|block|api|pmshri/i.test(r.url())) reqs.push(r.method() + " " + r.url().slice(0, 120));
});

await page.goto("https://pmshri.education.gov.in/schools", { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(2000);
reqs.length = 0;

await page.locator("#map_state_name").selectOption({ label: "BIHAR" });
await page.waitForTimeout(12000);

console.log("Requests after state select (sample):");
console.log([...new Set(reqs)].slice(0, 40).join("\n"));

const selects = await page.evaluate(() =>
  [...document.querySelectorAll("select")].map((s) => ({
    id: s.id,
    name: s.name,
    options: s.querySelectorAll("option").length,
    first: [...s.querySelectorAll("option")].slice(0, 5).map((o) => o.textContent.trim()),
  })),
);
console.log("\nSelects:", JSON.stringify(selects, null, 2));

await browser.close();
