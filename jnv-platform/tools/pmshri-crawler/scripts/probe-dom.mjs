import { chromium } from "playwright";

const page = await chromium.launch({ headless: true }).then((b) => b.newPage());
await page.goto("https://pmshri.education.gov.in/schools", { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(5000);

const scan = await page.evaluate(() => {
  const body = document.body.innerText.slice(0, 8000);
  const hasKnow = body.includes("Know More");
  const hasDistrict = /district/i.test(body);
  const buttons = [...document.querySelectorAll("button, a")]
    .map((el) => el.textContent.trim())
    .filter((t) => t.length && t.length < 60)
    .slice(0, 40);
  return { hasKnow, hasDistrict, buttons, textSample: body.slice(0, 1500) };
});
console.log(JSON.stringify(scan, null, 2));

const km = await page.getByRole("link", { name: /know more/i }).count();
console.log("Know More links:", km);

await page.context().browser().close();
