const base = "https://pmshri.education.gov.in/apipmshridashboard/api/v1";
const udise = "04010500103";
const id = "929";
const schoolId = "1300059";

const paths = [
  `/school/reportcard/${udise}`,
  `/school/reportCard/${udise}`,
  `/school/report-card/${udise}`,
  `/reportcard/${udise}`,
  `/school/reportcard/pdf/${udise}`,
  `/school/downloadReportCard/${udise}`,
  `/school/reportcard/${id}`,
  `/school/reportCard/${id}`,
  `/school/reportcard/${schoolId}`,
  `/generateReportCard/${udise}`,
  `/generate-report-card/${udise}`,
  `/school/generatePdf/${udise}`,
  `/v1/reportcard/${udise}`,
  `/sqaf/report/${udise}`,
  `/school/sqaf/${udise}`,
  `/benchmark/pdf/${udise}`,
  `/school/benchmark/${udise}`,
];

for (const p of paths) {
  const url = base + p;
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    const ab = await r.arrayBuffer();
    const head = new TextDecoder().decode(ab.slice(0, 5));
    const isPdf = head.startsWith("%PDF");
    console.log(r.status, isPdf ? "PDF!" : ct.slice(0, 50), p, "len", ab.byteLength);
  } catch (e) {
    console.log("err", p, e.message);
  }
}
