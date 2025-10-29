// middleware.js
import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

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
    return NextResponse.redirect(url);
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
