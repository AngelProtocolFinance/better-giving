import { useEffect, useState } from "react";

const copy_wait_time = 700;

export function use_copier(text: string) {
  const [copied, set_copied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => set_copied(false), copy_wait_time);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handle_copy() {
    //write access is automatically granted on active tab
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
    set_copied(true);
  }

  return { handle_copy, copied };
}
