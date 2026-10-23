import { useRef, useState } from "react";
import type { IDonorMessage } from "#/components/org-page/items";
import { report_error } from "#/errors/report";

interface IDonorsPage {
  items: {
    id: string;
    donor_name?: string | null;
    donor_message?: string | null;
  }[];
  next?: string;
}

/** a page of the messages-only donors feed: blank ones dropped, the amount
 * never read — the same rule the loader applies to the first page */
async function messages_page(npo_id: number, cursor: string) {
  const q = new URLSearchParams({ next: cursor, with_message: "1" });
  const res = await fetch(`/api/npo/${npo_id}/donors?${q}`);
  if (!res.ok) throw new Error(String(res.status));
  const page: IDonorsPage = await res.json();
  const messages: IDonorMessage[] = page.items
    .filter((m) => m.donor_message?.trim())
    .map((m) => ({
      id: m.id,
      name: m.donor_name || "Donor",
      message: m.donor_message as string,
    }));
  return { messages, next: page.next ?? null };
}

/** the loader's first page of messages, then each older page on `on_more`,
 * which is undefined once there is none. a failed page is reported and keeps
 * the cursor, so the next call asks again */
export function use_donor_messages(
  npo_id: number,
  seed: IDonorMessage[],
  next: string | null
) {
  const [more, set_more] = useState<IDonorMessage[]>([]);
  const [cursor, set_cursor] = useState(next);
  const inflight = useRef(false);

  /** one call shows at least one more message, or reaches the last page */
  async function load(from: string) {
    inflight.current = true;
    try {
      let at: string | null = from;
      let got = 0;
      while (at && got === 0) {
        const page = await messages_page(npo_id, at);
        got = page.messages.length;
        set_more((prev) => [...prev, ...page.messages]);
        at = page.next;
        set_cursor(at);
      }
    } catch (err) {
      report_error(err, { npo_id });
    } finally {
      inflight.current = false;
    }
  }

  // a revalidated first page can overlap what was already appended
  const seeded = new Set(seed.map((m) => m.id));
  return {
    messages: [...seed, ...more.filter((m) => !seeded.has(m.id))],
    on_more: cursor
      ? () => {
          if (!inflight.current) load(cursor);
        }
      : undefined,
  };
}
