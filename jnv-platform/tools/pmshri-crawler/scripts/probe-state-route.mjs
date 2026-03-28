import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://pmshri.education.gov.in/state", { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    url: location.href,
    len: t.length,
    hasKnowMoreSchool: /know more/i.test(t) && /JNV|Navodaya|NVS/i.test(t),
    hasDistrictSelect: !!document.querySelector("select[name*='district' i], select[id*='district' i]"),
    selects: [...document.querySelectorAll("select")].map((s) => ({
      id: s.id,
      name: s.name,
      n: s.querySelectorAll("option").length,
    })),
    inputs: [...document.querySelectorAll("input[type=search], input[placeholder*='search' i]")].map((i) => ({
      ph: i.placeholder,
      id: i.id,
    })),
    sample: t.slice(0, 2500),
  };
});
console.log(JSON.stringify(info, null, 2));

const km = await page.getByRole("link", { name: /know more/i }).count();
console.log("Know more count:", km);

await browser.close();
