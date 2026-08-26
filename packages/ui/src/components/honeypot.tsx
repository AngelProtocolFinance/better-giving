/** a bait field only a form-filling bot completes: out of the tab order, hidden
 * from assistive tech, invisible on screen — but plain, named, and fillable in
 * the markup a bot parses. the action rejects any post that arrives with a
 * value. `middle_name` is the name every caller posts; keep it plausible. */
export function Honeypot({ name = "middle_name" }: { name?: string }) {
  return (
    <input
      className="sr-only"
      type="text"
      name={name}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
    />
  );
}
