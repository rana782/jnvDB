import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const urls = new Set();
page.on("response", async (res) => {
  const u = res.url();
  if (/apipmshri|api\/v1/i.test(u)) urls.add(res.status() + " " + u);
});

await page.goto("https://pmshri.education.gov.in/schools", { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(3000);
urls.clear();
await page.locator("#map_state_name").selectOption({ label: "BIHAR" });
await page.waitForTimeout(15000);
console.log([...urls].sort().join("\n"));
await browser.close();
