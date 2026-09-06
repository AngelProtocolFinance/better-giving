// PageTransitionEvent is a browser global (pagehide/pageshow's event type);
// node has no DOM at all, so a test that constructs one directly (rather than
// getting it from a real page) needs a stand-in with the one field it reads.
if (typeof PageTransitionEvent === "undefined") {
  globalThis.PageTransitionEvent = class PageTransitionEvent extends Event {
    persisted: boolean;
    constructor(type: string, opts: { persisted?: boolean } = {}) {
      super(type);
      this.persisted = !!opts.persisted;
    }
  };
}
