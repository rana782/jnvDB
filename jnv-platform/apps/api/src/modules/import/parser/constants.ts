/** Bumped when structured snapshot schema or section extractors materially change. */
export const REPORT_CARD_PARSER_VERSION = "2.1.0";

/**
 * `parsingStatus` is stored as COMPLETE when overall extraction confidence is at or above this value.
 * Tuned for real report-card PDF variance; golden fixtures remain well above this.
 */
export const PARSING_COMPLETE_CONFIDENCE_THRESHOLD = 0.55;
