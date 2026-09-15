/**
 * did this error come from a unique violation on `constraint`?
 *
 * drizzle wraps the driver's error in a `DrizzleQueryError` whose `cause` carries
 * the postgres `code`, so the top-level error never has one.
 */
export function is_unique_violation(err: unknown, constraint: string): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    const pg = e as Error & { code?: unknown; constraint?: unknown };
    if (pg.code === "23505") return pg.constraint === constraint;
  }
  return false;
}
