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

// `unhandledrejection` fires after the microtask checkpoint that follows the
// rejection, so a macrotask hop is enough to observe it
const settle = () => new Promise((r) => setTimeout(r, 100));

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
          deferredServerData: Promise.reject(
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

    await settle();
    expect(unhandled.map((e) => e.reason?.name)).toEqual([]);
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
