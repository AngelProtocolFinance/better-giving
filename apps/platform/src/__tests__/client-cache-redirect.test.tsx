import { createMemoryRouter, RouterProvider } from "react-router";
import { useCachedLoaderData } from "remix-client-cache";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

const unhandled: PromiseRejectionEvent[] = [];
const on_unhandled = (e: PromiseRejectionEvent) => {
  e.preventDefault();
  unhandled.push(e);
};

afterEach(() => {
  window.removeEventListener("unhandledrejection", on_unhandled);
  unhandled.length = 0;
});

function Probe() {
  useCachedLoaderData();
  return <p>probe</p>;
}

// rejections are reported in the order they happened, so once a sentinel
// rejection has been reported every earlier one has been too
async function reported_through_sentinel() {
  Promise.reject(new Error("sentinel"));
  await vi.waitFor(() =>
    expect(unhandled.map((e) => e.reason?.message)).toContain("sentinel")
  );
  return unhandled
    .map((e) => e.reason)
    .filter((r) => r?.message !== "sentinel");
}

// the revalidation's rejection exists only once the hook subscribes, as a
// real request's does: a promise rejected before anything listens is itself
// reported as unhandled and would pollute what the test counts
function rejects_when_listened_to(reason: unknown) {
  let reject!: (r: unknown) => void;
  const p = new Promise<never>((_, rej) => {
    reject = rej;
  });
  const then = p.then.bind(p);
  // biome-ignore lint/suspicious/noThenProperty: the subscription is what arms the rejection
  Object.defineProperty(p, "then", {
    value: (...a: Parameters<typeof then>) => {
      const chained = then(...a);
      queueMicrotask(() => reject(reason));
      return chained;
    },
  });
  return p;
}

function render_redirected_route(navigate: (...a: unknown[]) => Promise<void>) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Probe,
        HydrateFallback: () => null,
        loader: () => ({
          serverData: {},
          key: "/",
          // the background revalidation of an expired session
          deferredServerData: rejects_when_listened_to(
            new Response(null, {
              status: 302,
              headers: { Location: "/login" },
            })
          ),
        }),
      },
    ],
    { initialEntries: ["/"] }
  );
  // useNavigate reads `router.navigate` at call time
  router.navigate = navigate as typeof router.navigate;
  return render(<RouterProvider router={router} />);
}

describe("useCachedLoaderData background redirect", () => {
  test("follows the 302, and a navigation interrupted by a later one is not an unhandled AbortError", async () => {
    window.addEventListener("unhandledrejection", on_unhandled);
    // router.navigate() rejects with AbortError when a later navigation interrupts it
    const navigate = vi.fn((..._: unknown[]) =>
      Promise.reject(new DOMException("signal is aborted", "AbortError"))
    );

    const screen = await render_redirected_route(navigate);
    await expect.element(screen.getByText("probe")).toBeVisible();
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/login", expect.anything())
    );

    expect(await reported_through_sentinel()).toEqual([]);
  });

  test("a navigate failure that is not an interruption still surfaces", async () => {
    window.addEventListener("unhandledrejection", on_unhandled);
    const navigate = vi.fn((..._: unknown[]) =>
      Promise.reject(new TypeError("boom"))
    );

    await render_redirected_route(navigate);
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/login", expect.anything())
    );

    await vi.waitFor(() =>
      expect(unhandled.map((e) => e.reason?.name)).toEqual(["TypeError"])
    );
  });
});
