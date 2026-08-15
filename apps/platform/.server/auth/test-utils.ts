import { createContext } from "react-router";
import { vi } from "vitest";

export interface AuthMockOpts {
  /** include get_session. pass object to set return value */
  session?: boolean | { user: any };
  /** include user_ctx */
  user_ctx?: boolean;
  /** include auth_mdlwr, admin_mdlwr, npo_admin_mdlwr as vi.fn() */
  middleware?: boolean;
}

// module-level singletons — fresh per test file (vitest isolates modules)
const _admin_ctx = createContext<number>();
const _user_ctx = createContext<any>();

export function make_auth_mock(opts: AuthMockOpts = {}) {
  const mock: Record<string, unknown> = {
    to_auth: vi.fn(() => new Response(null, { status: 401 })),
    admin_ctx: _admin_ctx,
    // the registration data layer imports these alongside `get_session`; a
    // module mock has to carry every named export its subject imports or the
    // import itself fails. no grant and no mail by default — a suite that
    // wants either drives it through the real modules instead.
    get_registrant: vi.fn(async () => null),
    request_login_link: vi.fn(async () => {}),
    check_email_url: vi.fn(() => "/check-email"),
  };

  if (opts.user_ctx) mock.user_ctx = _user_ctx;

  if (opts.session) {
    mock.get_session =
      typeof opts.session === "object"
        ? vi.fn(async () => opts.session)
        : vi.fn();
  }

  if (opts.middleware) {
    mock.auth_mdlwr = vi.fn();
    mock.admin_mdlwr = vi.fn();
    mock.npo_admin_mdlwr = vi.fn();
  }

  return mock;
}

export { _admin_ctx as admin_ctx, _user_ctx as user_ctx };
