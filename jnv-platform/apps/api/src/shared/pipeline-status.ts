import { z } from "zod";

/** Stored on `School.pipelineStatus` (Prisma `CompletionPipelineStatus`). */
export const PIPELINE_STATUS_VALUES = [
  "NOT_REVIEWED",
  "REVIEWED",
  "CONTACTED",
  "PILOT_READY",
  "PILOT_RUNNING",
  "DONE",
] as const;

export type PipelineStatusValue = (typeof PIPELINE_STATUS_VALUES)[number];

export const pipelineStatusSchema = z.enum(PIPELINE_STATUS_VALUES);
