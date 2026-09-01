// the self-hosted error tracker's public origin, shared by the two build-time
// paths that talk to it. it is not a secret (the same host is in the dsn every
// browser downloads) and it never varies by stage, so it is a constant rather
// than an env key.
//
// both paths need it separately: `sentryReactRouter` takes it as `sentryUrl`,
// while `sentryOnBuildEnd` constructs its own sentry-cli without forwarding
// that option — SENTRY_URL is the only channel it reads.
export const BUGSINK_URL = "https://bugsink-justin.fly.dev";
