import { chromium } from "playwright";
import { config } from "../config.js";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(config.baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(3000);

await page.locator("#map_state_name").selectOption({ index: 2 }); // ANDHRA
await page.waitForTimeout(5000);

const info = await page.evaluate(() => ({
  url: location.href,
  inputs: [...document.querySelectorAll("input,select")].map((el) => ({
    tag: el.tagName,
    id: el.id,
    name: el.name,
    placeholder: el.placeholder,
  })),
  links: [...document.querySelectorAll("a[href]")]
    .map((a) => ({ t: a.textContent.trim().slice(0, 40), h: a.href }))
    .filter((x) => /district|school|list|search/i.test(x.t + x.h))
    .slice(0, 30),
}));
console.log(JSON.stringify(info, null, 2));

await browser.close();
