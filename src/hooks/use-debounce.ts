import { useCallback, useEffect, useRef } from "react";

export function use_debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  const fn_ref = useRef(fn);
  const timer_ref = useRef<ReturnType<typeof setTimeout>>(undefined);
  const delay_ref = useRef(delay);
  delay_ref.current = delay;

  useEffect(() => {
    fn_ref.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timer_ref.current) clearTimeout(timer_ref.current);
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timer_ref.current) clearTimeout(timer_ref.current);
      timer_ref.current = setTimeout(
        () => fn_ref.current(...args),
        delay_ref.current
      );
    }) as T,
    []
  );
}
