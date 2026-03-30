import { getPrisma } from "../src/shared/prisma.js";
import { calculateRevenue, presetModelInputs } from "../src/modules/analytics/revenue-calculator.js";

async function main() {
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({
    select: {
      udise: true,
      totalStudents: true,
      totalBoys: true,
      totalGirls: true,
    },
  });

  await prisma.schoolRevenueScenario.deleteMany({});

  let rows = 0;
  for (const s of schools) {
    const totalStudents =
      s.totalStudents ??
      ((s.totalBoys ?? 0) + (s.totalGirls ?? 0) > 0 ? (s.totalBoys ?? 0) + (s.totalGirls ?? 0) : 0);

    for (const kind of ["LOW", "MEDIUM", "HIGH"] as const) {
      const model = presetModelInputs(kind);
      const r = calculateRevenue({
        totalStudents,
        boys: s.totalBoys ?? undefined,
        girls: s.totalGirls ?? undefined,
        ...model,
      });
      await prisma.schoolRevenueScenario.create({
        data: {
          udise: s.udise,
          kind,
          label: kind.toLowerCase(),
          inputs: model as object,
          monthlyRevenue: r.monthlyRevenue,
          annualRevenue: r.annualRevenue,
          revenueBoys: r.revenueBoys,
          revenueGirls: r.revenueGirls,
          revenueTotal: r.revenueTotal,
        },
      });
      rows++;
    }
  }

  console.log({ schools: schools.length, scenarioRows: rows });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
