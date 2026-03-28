import { getPrisma } from "../../shared/prisma.js";

export async function dashboardSummary() {
  const prisma = getPrisma();
  const [
    totalSchools,
    studentsAgg,
    pipelineDone,
    revenueAgg,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.school.aggregate({
      _sum: { totalStudents: true, totalBoys: true, totalGirls: true },
    }),
    prisma.school.count({ where: { pipelineStatus: "DONE" } }),
    prisma.schoolRevenueScenario.aggregate({
      where: { kind: "CUSTOM" },
      _sum: { monthlyRevenue: true, annualRevenue: true },
    }),
  ]);

  return {
    totalSchools,
    totalStudents: studentsAgg._sum.totalStudents ?? 0,
    totalBoys: studentsAgg._sum.totalBoys ?? 0,
    totalGirls: studentsAgg._sum.totalGirls ?? 0,
    schoolsCompleted: pipelineDone,
    portfolioMonthlyRevenue: revenueAgg._sum.monthlyRevenue ?? 0,
    portfolioAnnualRevenue: revenueAgg._sum.annualRevenue ?? 0,
  };
}

export async function dashboardProgress() {
  const prisma = getPrisma();
  const [totalSchools, pipelineGroups, parsingGroups] = await Promise.all([
    prisma.school.count(),
    prisma.school.groupBy({
      by: ["pipelineStatus"],
      _count: { _all: true },
    }),
    prisma.school.groupBy({
      by: ["parsingStatus"],
      _count: { _all: true },
    }),
  ]);

  const pipeline: Record<string, number> = {};
  for (const row of pipelineGroups) {
    pipeline[row.pipelineStatus] = row._count._all;
  }
  const parsing: Record<string, number> = {};
  for (const row of parsingGroups) {
    parsing[row.parsingStatus] = row._count._all;
  }

  const donePipeline = pipeline["DONE"] ?? 0;

  return {
    totalSchools,
    pipeline,
    parsing,
    schoolsPipelineDone: donePipeline,
    pipelineDonePercent: totalSchools > 0 ? Math.round((donePipeline / totalSchools) * 100) : 0,
  };
}
