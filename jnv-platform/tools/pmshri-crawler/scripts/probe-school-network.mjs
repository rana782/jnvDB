import { chromium } from "playwright";

const udise = "04010500103";
const url = `https://pmshri.education.gov.in/school/${udise}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/pdf|report|card|download/i.test(u) && !/favicon|woff|css/i.test(u)) {
    hits.push({ u, status: res.status(), ct: res.headers()["content-type"] || "" });
  }
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(8000);
const links = await page.locator("a[href]").evaluateAll((as) =>
  as.map((a) => ({ href: a.getAttribute("href"), t: (a.textContent || "").trim().slice(0, 40) })),
);
const interesting = links.filter((x) => x.href && /pdf|report|school|udise/i.test(x.href + x.t));
console.log("network hits", JSON.stringify(hits.slice(0, 30), null, 2));
console.log("links", JSON.stringify(interesting.slice(0, 40), null, 2));
console.log("buttons", await page.locator("button, [role=button]").allTextContents().then((t) => t.filter((x) => /report|pdf|card/i.test(x)).slice(0, 20)));
await browser.close();
