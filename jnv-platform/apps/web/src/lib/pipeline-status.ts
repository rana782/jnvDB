export const PIPELINE_STATUS_ORDER = [
  "NOT_REVIEWED",
  "REVIEWED",
  "CONTACTED",
  "PILOT_READY",
  "PILOT_RUNNING",
  "DONE",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUS_ORDER)[number];

const LABELS: Record<PipelineStatus, string> = {
  NOT_REVIEWED: "Not reviewed",
  REVIEWED: "Reviewed",
  CONTACTED: "Contacted",
  PILOT_READY: "Pilot ready",
  PILOT_RUNNING: "Pilot running",
  DONE: "Done",
};

/** Tailwind classes: subtle pill per stage. */
const BADGE_CLASS: Record<PipelineStatus, string> = {
  NOT_REVIEWED: "border-line bg-slate-50 text-muted",
  REVIEWED: "border-sky-200 bg-sky-50 text-sky-900",
  CONTACTED: "border-violet-200 bg-violet-50 text-violet-900",
  PILOT_READY: "border-amber-200 bg-amber-50 text-amber-900",
  PILOT_RUNNING: "border-teal-200 bg-teal-50 text-teal-900",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export function pipelineStatusLabel(status: string): string {
  if (status in LABELS) return LABELS[status as PipelineStatus];
  return status || "—";
}

export function pipelineBadgeClass(status: string): string {
  if (status in BADGE_CLASS) return BADGE_CLASS[status as PipelineStatus];
  return "border-line bg-slate-50 text-muted";
}
