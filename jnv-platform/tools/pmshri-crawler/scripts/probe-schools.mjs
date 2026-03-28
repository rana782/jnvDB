import { chromium } from "playwright";

const urls = [
  "https://pmshri.education.gov.in/schools",
  "https://pmshri.education.gov.in/state",
];

const browser = await chromium.launch({ headless: true });
for (const url of urls) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(4000);
    const title = await page.title();
    const selects = await page.evaluate(() =>
      [...document.querySelectorAll("select")].map((s, i) => ({
        i,
        id: s.id,
        n: s.querySelectorAll("option").length,
        sample: [...s.querySelectorAll("option")]
          .slice(0, 8)
          .map((o) => o.textContent.trim()),
      })),
    );
    console.log("\n===", url, "title:", title, "===");
    console.log(JSON.stringify(selects, null, 2));
  } catch (e) {
    console.log(url, e.message);
  }
  await page.close();
}
await browser.close();
