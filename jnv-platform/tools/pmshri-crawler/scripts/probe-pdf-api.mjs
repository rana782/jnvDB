const base = "https://pmshri.education.gov.in/apipmshridashboard/api/v1";
const paths = [
  "/school/reportcard/10082102005",
  "/school/report/10082102005",
  "/reportcard/10082102005",
  "/school/pdf/10082102005",
  "/pdf/reportcard/10082102005",
  "/school/report-card/4647",
  "/school/reportcard/4647",
];

for (const p of paths) {
  const url = base + p;
  try {
    const r = await fetch(url, { redirect: "manual" });
    const ct = r.headers.get("content-type") || "";
    const buf = await r.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 8));
    console.log(r.status, p, ct.slice(0, 40), head);
  } catch (e) {
    console.log("err", p, e.message);
  }
}
