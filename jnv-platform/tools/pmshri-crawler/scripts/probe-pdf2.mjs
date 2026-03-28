const base = "https://pmshri.education.gov.in/apipmshridashboard/api/v1";
const u = "10082102005";
const paths = [
  `/school/sqaf/${u}`,
  `/sqaf/report/${u}`,
  `/school/benchmark/${u}`,
  `/download/reportcard/${u}`,
  `/school/reportCard/${u}`,
  `/generatePdf/${u}`,
  `/school/generate-report/${u}`,
];

for (const p of paths) {
  const url = base + p;
  const r = await fetch(url, { method: "GET", redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  const t = (await r.text()).slice(0, 120);
  console.log(r.status, p, ct, t);
}
