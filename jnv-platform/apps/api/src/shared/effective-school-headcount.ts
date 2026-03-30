/**
 * Headcount for dashboard KPIs: prefer denormalized `School` columns, then social "Total" row.
 */
export type SchoolHeadcountSources = {
  totalStudents: number | null;
  totalBoys: number | null;
  totalGirls: number | null;
  enrolmentSocial: { total: number | null; boys: number | null; girls: number | null }[];
};

export function effectiveHeadcountFromRow(s: SchoolHeadcountSources): {
  total: number;
  boys: number;
  girls: number;
} {
  const soc = s.enrolmentSocial[0];
  const colT = s.totalStudents;
  const colB = s.totalBoys;
  const colG = s.totalGirls;
  const socT = soc?.total;
  const socB = soc?.boys;
  const socG = soc?.girls;

  if (colT != null && colT > 0) {
    const b = colB ?? 0;
    const g = colG ?? 0;
    if (b > 0 || g > 0) return { total: colT, boys: b, girls: g };
    return { total: colT, boys: Math.round(colT / 2), girls: colT - Math.round(colT / 2) };
  }

  if (socT != null && socT > 0) {
    let boys = socB ?? 0;
    let girls = socG ?? 0;
    if (boys === 0 && girls === 0) {
      boys = Math.round(socT / 2);
      girls = socT - boys;
    } else if (boys > 0 && girls === 0) girls = socT - boys;
    else if (girls > 0 && boys === 0) boys = socT - girls;
    return { total: socT, boys, girls };
  }

  const sumCol = (colB ?? 0) + (colG ?? 0);
  if (sumCol > 0) return { total: sumCol, boys: colB ?? 0, girls: colG ?? 0 };

  const sumSoc = (socB ?? 0) + (socG ?? 0);
  if (sumSoc > 0) return { total: sumSoc, boys: socB ?? 0, girls: socG ?? 0 };

  return { total: 0, boys: 0, girls: 0 };
}
