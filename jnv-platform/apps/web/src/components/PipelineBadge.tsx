import { motion } from "framer-motion";
import { pipelineBadgeClass, pipelineStatusLabel } from "../lib/pipeline-status";
import { fast } from "../lib/animationConfig";

export function PipelineBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "—";
  if (s === "—") {
    return (
      <motion.span
        className="inline-flex rounded-full border border-line bg-surface-3 px-2 py-0.5 text-xs text-muted"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={fast}
      >
        —
      </motion.span>
    );
  }
  return (
    <motion.span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${pipelineBadgeClass(s)}`}
      title={s}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={fast}
    >
      {pipelineStatusLabel(s)}
    </motion.span>
  );
}
