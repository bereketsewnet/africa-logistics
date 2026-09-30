/**
 * Pagination helpers (src/utils/pagination.ts)
 *
 * Four handlers had hand-rolled this, and none of them clamped `limit` — a
 * client could ask for `?limit=100000` and pull the whole table in one request.
 * A fleet company can hold hundreds of vehicles, so that ceiling now matters.
 */

export const DEFAULT_PAGE_LIMIT = 25
export const MAX_PAGE_LIMIT = 100

export interface Pagination {
  page: number
  limit: number
  offset: number
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  pages: number
}

/** Parse `?page` / `?limit`, tolerating junk and clamping to a sane window. */
export function parsePagination(
  query: { page?: string | number; limit?: string | number } | undefined,
  defaultLimit: number = DEFAULT_PAGE_LIMIT
): Pagination {
  const rawPage = Number(query?.page ?? 1)
  const rawLimit = Number(query?.limit ?? defaultLimit)

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT)
    : defaultLimit

  return { page, limit, offset: (page - 1) * limit }
}

/** Build the `pagination` envelope the admin list endpoints already return. */
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  return {
    total: safeTotal,
    page,
    limit,
    pages: limit > 0 ? Math.ceil(safeTotal / limit) : 0,
  }
}

/**
 * Whitelist a client-supplied sort column. Never interpolate a raw query value
 * into `ORDER BY`. The `id` tiebreaker is the caller's job — without it, rows
 * created in the same second reshuffle between pages.
 */
export function resolveSortColumn(
  requested: string | undefined,
  allowed: readonly string[],
  fallback: string
): string {
  return requested && allowed.includes(requested) ? requested : fallback
}

/** Normalise `?dir` to a literal safe for interpolation. */
export function resolveSortDirection(requested: string | undefined): 'ASC' | 'DESC' {
  return String(requested ?? '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
}
