import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * what an asked component receives on top of its own props.
 *
 * `open` and `on_closed` are the exit-animation contract: `resolve` settles the
 * caller's promise immediately — the handler that awaited it runs on the next
 * microtask — but the ask stays mounted with `open === false` so the dialog can
 * play its close animation, and is unmounted when `on_closed` fires. wire
 * `on_closed` to the dialog's exit-complete; `Modal` and `Prompt` take it as
 * `onExitComplete`.
 */
export interface AskProps<T = void> {
  open: boolean;
  /** settles the awaited promise. called with no value it answers `undefined` — the dismissed case. */
  resolve: (value?: T) => void;
  on_closed: () => void;
}

export interface AskOpts {
  /**
   * one slot. asking again on the same key settles the pending ask with
   * `undefined` and swaps this one into the SAME mounted entry, so the dialog
   * stays put and only its content changes — a "processing" prompt becoming an
   * error is one dialog, not a close and a reopen.
   */
  key?: string;
}

/** the call signature `ask` and `use_ask`'s bound form both carry. */
export type AskFn = <T = void, P extends object = Record<string, never>>(
  Component: ComponentType<P & AskProps<T>>,
  props?: P,
  opts?: AskOpts
) => Promise<T | undefined>;

interface Entry {
  id: number;
  key?: string;
  // the store is heterogeneous by construction; each entry's props were
  // checked at the `ask()` call that created it
  Component: ComponentType<any>;
  props: Record<string, unknown>;
  settle: (value: unknown) => void;
  /** answered already, and only still mounted so its dialog can animate out */
  settled?: boolean;
}

const EMPTY: Entry[] = [];
/**
 * the ask never outlives its dialog's exit-complete in practice; this only
 * catches a component that resolves without ever animating out, so the entry
 * can't sit in the store for the rest of the session. comfortably past
 * `--duration-base` (200ms), the longest of the two exit animations.
 */
const UNMOUNT_BACKSTOP_MS = 1000;

let entries: Entry[] = EMPTY;
let next_id = 0;
const listeners = new Set<() => void>();

function commit(next: Entry[]) {
  entries = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => entries;
// nothing is ever asked during SSR — the store is module state a handler writes
const server_snapshot = () => EMPTY;

/**
 * mount a component and await what it answers, from anywhere — an event
 * handler, an effect, a promise chain.
 *
 * requires `<AskHost />` in the tree.
 *
 * a question raised from a component that can unmount belongs on `use_ask`
 * instead: this one outlives its caller, and an unanswered dialog over a page
 * that no longer knows about it is the failure that buys.
 *
 * @example
 * const cropped = await ask<File>(ImgCropper, { input, aspect });
 * if (!cropped) return; // dismissed
 */
export const ask: AskFn = (Component, props, opts) =>
  start(Component, props, opts)[0];

/**
 * the whole of `ask`, plus the handle `use_ask` cancels on unmount. cancelling
 * settles the promise with `undefined` — the same answer a dismissal gives, so
 * a caller that already handles "dismissed" needs no second branch.
 */
function start<T, P extends object>(
  Component: ComponentType<P & AskProps<T>>,
  props?: P,
  opts?: AskOpts
): [Promise<T | undefined>, () => void] {
  // module state on a warm server instance is shared between requests, and no
  // host renders there — refuse rather than leave an entry behind
  if (typeof document === "undefined") {
    return [Promise.resolve(undefined), () => {}];
  }

  let cancel = () => {};
  const promise = new Promise<T | undefined>((res) => {
    const fields = (props ?? {}) as Record<string, unknown>;
    // P is erased at the store boundary — see Entry
    const C = Component as ComponentType<any>;

    // an answered entry still holds its key while it animates out; taking it
    // over would swap content into a dialog that is already closing.
    const held = opts?.key
      ? entries.find((e) => e.key === opts.key && !e.settled)
      : undefined;
    const id = held?.id ?? next_id++;

    let done = false;
    const settle = (value: unknown) => {
      if (done) return;
      done = true;
      res(value as T | undefined);
    };

    cancel = () => {
      if (done) return;
      settle(undefined);
      // only when this ask still owns the slot: a keyed replacement inherited
      // the id, and dropping that would unmount the question now on screen
      if (entries.find((e) => e.id === id)?.settle === settle) {
        commit(entries.filter((e) => e.id !== id));
      }
    };

    commit(
      held
        ? entries.map((e) =>
            e === held
              ? { ...e, Component: C, props: fields, settle, settled: false }
              : e
          )
        : [
            ...entries,
            { id, key: opts?.key, Component: C, props: fields, settle },
          ]
    );

    // the superseded question answers `undefined`: it kept no entry of its
    // own, so nothing will ever come back for it.
    held?.settle(undefined);

    // a host above the caller subscribes after the caller's own mount effect,
    // so an ask raised on mount finds no listener yet. the check waits a task
    // for that subscription to land; still none by then and nothing will ever
    // answer this one.
    if (!listeners.size) {
      setTimeout(() => {
        if (done || listeners.size) return;
        console.error(
          "ask(): no <AskHost /> is mounted, so this question can't be shown"
        );
        cancel();
      });
    }
  });
  return [promise, cancel];
}

/**
 * `ask` bound to the caller's lifetime: a component that goes away takes its
 * open questions — and the continuation waiting on each — with it.
 *
 * `AskHost` is at the root, so without this an ask survives its caller: a
 * non-dismissable prompt can strand over a page with no code left to close
 * it.
 */
export function use_ask(): AskFn {
  const pending = useRef<Set<() => void>>(undefined);
  pending.current ??= new Set();

  useEffect(
    () => () => {
      const open = pending.current;
      if (!open) return;
      for (const cancel of open) cancel();
      open.clear();
    },
    []
  );

  // one identity for the life of the component, so an effect can depend on it.
  // a ref rather than `useState`, whose initializer overload can't tell a
  // factory from the function type it would return.
  const fn = useRef<AskFn>(undefined);
  fn.current ??= (Component, props, opts) => {
    const [promise, cancel] = start(Component, props, opts);
    const open = pending.current;
    open?.add(cancel);
    return promise.finally(() => open?.delete(cancel));
  };
  return fn.current;
}

/**
 * test-only: drops every pending ask. the store is module state and outlives a
 * rendered tree, so a suite that asks without answering leaks its dialog into
 * the next test. settles rather than merely clearing — a bare drop would leave
 * whatever awaited the ask hung for the rest of the run.
 */
export function _reset_asks() {
  const pending = entries;
  commit(EMPTY);
  for (const e of pending) if (!e.settled) e.settle(undefined);
}

/**
 * where `ask` mounts. renders nothing until something is asked, so it belongs
 * once, at the root.
 */
export function AskHost() {
  const list = useSyncExternalStore(subscribe, snapshot, server_snapshot);
  return (
    <>
      {list.map((e) => (
        <AskEntry key={e.id} entry={e} />
      ))}
    </>
  );
}

function AskEntry({ entry }: { entry: Entry }) {
  const [open, set_open] = useState(true);
  // a dialog can fire exit-complete after a resolve that a keyed replacement
  // has already superseded; both paths filter by id, so neither can drop the
  // entry the other is showing.
  const backstop = useRef<ReturnType<typeof setTimeout>>(undefined);

  // the entry can also leave the store without going through `remove` — a
  // cancel, or `_reset_asks` — and a timer left armed then commits into a
  // store this component no longer has anything in.
  useEffect(() => () => clearTimeout(backstop.current), []);

  const remove = () => {
    clearTimeout(backstop.current);
    commit(entries.filter((x) => x.id !== entry.id));
  };

  return (
    <entry.Component
      {...entry.props}
      open={open}
      on_closed={remove}
      resolve={(value?: unknown) => {
        // `settle` is swapped on a keyed replacement, so read it off the entry
        // at call time rather than closing over it
        entry.settle(value);
        entry.settled = true;
        set_open(false);
        backstop.current = setTimeout(remove, UNMOUNT_BACKSTOP_MS);
      }}
    />
  );
}
