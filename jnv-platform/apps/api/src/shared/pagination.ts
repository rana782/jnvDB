import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function offsetLimit(p: PaginationQuery) {
  const take = p.pageSize;
  const skip = (p.page - 1) * take;
  return { take, skip };
}
