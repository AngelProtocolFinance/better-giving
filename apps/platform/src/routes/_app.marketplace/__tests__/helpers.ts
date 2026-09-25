/** a loader run `hold` picks waits until `release`; `held` counts them */
export function gate(hold: (url: URL) => boolean) {
  let release = () => {};
  const opened = new Promise<void>((r) => {
    release = r;
  });
  const held = { count: 0 };
  const wait = async (url: URL) => {
    if (!hold(url)) return;
    held.count++;
    await opened;
  };
  return { release: () => release(), held, wait };
}

/** react installs its own `value` setter on the node and compares against it to
 *  decide whether a change event is real, so assigning `input.value` directly
 *  makes react skip onChange. reaching the prototype setter is what lets a
 *  keystroke and the click after it share one tick — a wall-clock gap between
 *  them would let the debounce window close and the test assert nothing. */
export function keystroke(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
