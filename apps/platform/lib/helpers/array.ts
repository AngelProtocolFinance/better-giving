// es2022 is the floor the bundle is built at (vite.config.ts build.target), and
// esbuild lowers syntax but never library methods — so the es2023/es2024 array
// and object helpers can't be used, even where node would have them. these are
// the local stand-ins.

// stand-in for Object.groupBy (es2024). returns the same Partial<Record<..>>
// shape: a key is absent when nothing maps to it.
export function group_by<T, K extends PropertyKey>(
  items: readonly T[],
  key: (item: T) => K
): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    const k = key(item);
    const bucket = out[k];
    if (bucket) bucket.push(item);
    else out[k] = [item];
  }
  return out;
}
