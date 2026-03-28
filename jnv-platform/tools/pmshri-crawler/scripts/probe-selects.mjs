import { chromium } from "playwright";
import { config } from "../config.js";

const page = await chromium.launch({ headless: true }).then((b) => b.newPage());
await page.goto(config.baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(4000);

const dump = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("select").forEach((sel, i) => {
    const opts = [...sel.querySelectorAll("option")].map((o) => ({
      text: o.textContent.trim(),
      value: o.value,
    }));
    out.push({ i, id: sel.id, name: sel.name, n: opts.length, opts: opts.slice(0, 15) });
  });
  return out;
});
console.log(JSON.stringify(dump, null, 2));

const state = page.locator("#map_state_name");
if (await state.count()) {
  await state.selectOption({ index: 1 });
  await page.waitForTimeout(8000);
  const dump2 = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("select").forEach((sel, i) => {
      const opts = [...sel.querySelectorAll("option")].map((o) => o.textContent.trim());
      out.push({ i, id: sel.id, name: sel.name, n: opts.length, opts: opts.slice(0, 25) });
    });
    return out;
  });
  console.log("After state select:", JSON.stringify(dump2, null, 2));
}

await page.context().browser().close();
