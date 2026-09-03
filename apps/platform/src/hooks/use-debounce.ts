import { useCallback, useEffect, useMemo, useRef } from "react";

/** the debounced fn, plus a `cancel` for callers whose pending call can be
 *  voided by something other than another keystroke — a url change under a
 *  search box, say, whose late callback would land after the revalidation. */
export type Debounced<T extends (...args: any[]) => void> = T & {
  cancel: () => void;
};

export function use_debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): Debounced<T> {
  const fn_ref = useRef(fn);
  const timer_ref = useRef<ReturnType<typeof setTimeout>>(undefined);
  const delay_ref = useRef(delay);
  delay_ref.current = delay;

  useEffect(() => {
    fn_ref.current = fn;
  }, [fn]);

  const cancel = useCallback(() => {
    if (timer_ref.current) clearTimeout(timer_ref.current);
    timer_ref.current = undefined;
  }, []);

  useEffect(() => {
    return () => {
      if (timer_ref.current) clearTimeout(timer_ref.current);
    };
  }, []);

  const debounced = useCallback(
    ((...args: Parameters<T>) => {
      if (timer_ref.current) clearTimeout(timer_ref.current);
      timer_ref.current = setTimeout(
        () => fn_ref.current(...args),
        delay_ref.current
      );
    }) as T,
    []
  );

  return useMemo(
    () => Object.assign(debounced, { cancel }),
    [debounced, cancel]
  );
}
