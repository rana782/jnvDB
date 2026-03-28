const r = await fetch("https://pmshri.education.gov.in/");
const h = await r.text();
const scripts = [...h.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log(scripts.filter((s) => /main|chunk|app/i.test(s)).slice(0, 30));
