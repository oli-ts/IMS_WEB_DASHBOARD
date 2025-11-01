// middleware.js
import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// Absolute session timeout (8 hours)
const SESSION_START_COOKIE = "session-started-at";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

const AUTH_PATHS = new Set([
  "/signin",
  "/forgot-password",
  "/auth/reset-password",
]);

export async function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  // Public assets & APIs that shouldn't be guarded
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname.match(/\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico|ttf|woff2?)$/);

  // Public auth pages
  const isAuthRoute = AUTH_PATHS.has(pathname);

  // Allow these through unmodified
  if (isPublicAsset || isAuthRoute) {
    return NextResponse.next();
  }

  // Protect the rest
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Not signed in → send to sign-in (but don't stack redirectTo repeatedly)
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    if (!searchParams.has("redirectTo")) {
      const query = searchParams.size ? `?${searchParams.toString()}` : "";
      url.searchParams.set("redirectTo", pathname);
    }
    const redirectRes = NextResponse.redirect(url);
    redirectRes.cookies.delete(SESSION_START_COOKIE, { path: "/" });
    return redirectRes;
  }

  // Enforce absolute 8h timeout using a cookie tracking session start
  if (session) {
    const startedCookie = req.cookies.get(SESSION_START_COOKIE)?.value;
    const now = Date.now();

    if (!startedCookie) {
      // First authenticated request in this session: set the start cookie
      res.cookies.set(SESSION_START_COOKIE, String(now), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000), // seconds
        path: "/",
      });
    } else {
      const startedAt = Number(startedCookie);
      if (!Number.isNaN(startedAt) && now - startedAt > SESSION_MAX_AGE_MS) {
        // Session exceeded max age: sign out and redirect to sign-in
        const url = req.nextUrl.clone();
        url.pathname = "/signin";
        url.searchParams.set("reason", "timeout");
        const redirectRes = NextResponse.redirect(url);
        const sbForRedirect = createMiddlewareClient({ req, res: redirectRes });
        await sbForRedirect.auth.signOut();
        redirectRes.cookies.delete(SESSION_START_COOKIE, { path: "/" });
        return redirectRes;
      }
    }
  }

  // Signed in but hits an auth page (e.g., user manually goes to /signin) → bounce home
  if (session && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("redirectTo");
    return NextResponse.redirect(url);
  }

  return res;
}

// Apply to all routes except static files (handled above)
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/"],
};
