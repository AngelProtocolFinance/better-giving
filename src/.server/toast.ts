import { createCookieSessionStorage } from "react-router";
import { createToastUtilsWithCustomSession } from "remix-toast";
import { app } from "$/env";

const session = createCookieSessionStorage({
  cookie: {
    name: "bg-toast",
    secrets: [app.session_secret],
    sameSite: "lax",
    httpOnly: true,
    secure: true,
    path: "/",
  },
});

export const { getToast, redirectWithSuccess, dataWithSuccess, dataWithError } =
  createToastUtilsWithCustomSession(session);
