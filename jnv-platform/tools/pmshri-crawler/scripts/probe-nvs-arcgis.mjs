const base = "https://webgis.nic.in/publishing/rest/services/misc/pmshree/MapServer/0/query";

async function q(where, opts = {}) {
  const p = new URLSearchParams({
    f: "json",
    where,
    returnGeometry: "false",
    ...opts,
  });
  const r = await fetch(`${base}?${p}`);
  return r.json();
}

const nameWhere =
  "(UPPER(schname) LIKE '%NAVODAYA%' OR UPPER(schname) LIKE '%JNV%' OR UPPER(schname) LIKE '%JAWAHAR%' OR UPPER(schname) LIKE '%JAWARHAR%')";

// schmgt=93 in layer = NVS (matches API sch_mgmt_center_id 93)
let j = await q("schmgt=93", { outFields: "schname,udise_sch_,lgd_state_", resultRecordCount: "25" });
console.log("sample schmgt=93", j.features?.slice(0, 5).map((f) => f.attributes));

j = await q(`schmgt=93 AND NOT ${nameWhere}`, {
  outFields: "schname,udise_sch_,lgd_state_",
  resultRecordCount: "30",
});
console.log(
  "JNV by schmgt=93 but NOT name match (first 30):",
  j.features?.map((f) => f.attributes?.schname),
);

j = await q(`schmgt=93 AND NOT ${nameWhere}`, { returnCountOnly: "true" });
console.log("count schmgt=93 minus name pattern", j.count);

j = await q("schmgt=93", { returnCountOnly: "true" });
console.log("total schmgt=93 (all India)", j.count);
