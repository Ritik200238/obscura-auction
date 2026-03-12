export function paginate<T>(items: T[], page: number, limit: number): { data: T[]; total: number; page: number; limit: number } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100); // cap at 100
  const start = (safePage - 1) * safeLimit;
  return {
    data: items.slice(start, start + safeLimit),
    total: items.length,
    page: safePage,
    limit: safeLimit,
  };
}
