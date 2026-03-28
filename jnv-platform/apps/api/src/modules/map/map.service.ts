import { getPrisma } from "../../shared/prisma.js";

export async function mapAggregates(filters: {
  water?: boolean;
  electricity?: boolean;
  internet?: boolean;
  pipelineStatus?: string;
}) {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filters.water !== undefined) where.waterAvailable = filters.water;
  if (filters.electricity !== undefined) where.electricityAvailable = filters.electricity;
  if (filters.internet !== undefined) where.internetAvailable = filters.internet;
  if (filters.pipelineStatus) where.pipelineStatus = filters.pipelineStatus;

  const schools = await prisma.school.findMany({
    where,
    select: {
      udise: true,
      geographicState: true,
      geographicDistrict: true,
      totalStudents: true,
      pipelineStatus: true,
      waterAvailable: true,
      electricityAvailable: true,
      internetAvailable: true,
      state: { select: { regionId: true, region: { select: { id: true, name: true, code: true } } } },
    },
  });

  const byState = new Map<
    string,
    { count: number; students: number; districts: Set<string> }
  >();
  const byRegion = new Map<string, { count: number; students: number }>();

  for (const s of schools) {
    const st = s.geographicState || "Unknown";
    if (!byState.has(st)) byState.set(st, { count: 0, students: 0, districts: new Set() });
    const agg = byState.get(st)!;
    agg.count++;
    agg.students += s.totalStudents ?? 0;
    if (s.geographicDistrict) agg.districts.add(s.geographicDistrict);

    const rid = s.state?.region?.id || s.state?.regionId || "unassigned";
    const rname = s.state?.region?.name || "Unassigned";
    const key = `${rid}::${rname}`;
    if (!byRegion.has(key)) byRegion.set(key, { count: 0, students: 0 });
    const r = byRegion.get(key)!;
    r.count++;
    r.students += s.totalStudents ?? 0;
  }

  return {
    states: [...byState.entries()].map(([name, v]) => ({
      name,
      schoolCount: v.count,
      studentSum: v.students,
      districtCount: v.districts.size,
    })),
    regions: [...byRegion.entries()].map(([key, v]) => {
      const [, name] = key.split("::");
      return { name, schoolCount: v.count, studentSum: v.students };
    }),
    totalSchools: schools.length,
  };
}
