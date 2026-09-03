import { NextResponse, type NextRequest } from "next/server";
import { isWalletAuthConfigured } from "./app/lib/auth-config";
import {
  isAllowedGwapAppPath,
  isGwapAppHostname,
} from "./app/lib/app-domain-routing";
import {
  AUTH_LOOP_COOKIE,
  AUTH_LOOP_WINDOW_SECONDS,
  isAuthLoopDetected,
  parseAuthLoopBounceCount,
} from "./app/lib/auth-loop-guard";

// Every redirect that sends /app traffic toward sign-in (for any reason -
// missing cookie, unrefreshed session, or the layout rejecting a session it
// couldn't verify) counts as one bounce here. A session that keeps failing
// the same way keeps arriving back at one of these branches; a session that
// is actually recovering does not. Once the count reaches the limit within
// the window, stop forwarding automatically - land on sign-in with
// session_issue=1 instead, which the sign-in UI uses to require an explicit
// reconnect rather than silently retrying the same failing path forever.
function currentAuthLoopBounceCount(request: NextRequest) {
  return parseAuthLoopBounceCount(request.cookies.get(AUTH_LOOP_COOKIE)?.value);
}

function withAuthLoopCookie(
  response: NextResponse,
  bounceCount: number,
  loopDetected: boolean,
) {
  if (loopDetected) {
    response.cookies.delete(AUTH_LOOP_COOKIE);
  } else {
    response.cookies.set(AUTH_LOOP_COOKIE, String(bounceCount + 1), {
      maxAge: AUTH_LOOP_WINDOW_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

export default function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const isAppDomain = isGwapAppHostname(host);
  const pathname = request.nextUrl.pathname;

  if (isAppDomain) {
    if (pathname === "/") {
      const target = request.nextUrl.clone();
      target.pathname = "/os-entry";
      return NextResponse.rewrite(target);
    }

    if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) {
      const bounceCount = currentAuthLoopBounceCount(request);
      const loopDetected = isAuthLoopDetected(bounceCount);

      const target = request.nextUrl.clone();
      target.pathname = "/os-sign-in";
      if (loopDetected) target.searchParams.set("session_issue", "1");

      return withAuthLoopCookie(
        NextResponse.redirect(target),
        bounceCount,
        loopDetected,
      );
    }

    if (!isAllowedGwapAppPath(pathname)) {
      const target = request.nextUrl.clone();
      target.pathname = "/";
      target.search = "";
      return NextResponse.redirect(target);
    }
  }

  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  if (!isWalletAuthConfigured()) return NextResponse.next();

  const redirectPath = `${pathname}${request.nextUrl.search}`;
  // A privy-token cookie only proves a token was issued at some point, not
  // that the layout can still verify it - that's exactly what the loop
  // below is guarding against. Clearing the bounce counter here just
  // because the cookie exists would erase it right before the request that
  // is about to fail again, so the counter never has a chance to
  // accumulate. Leave it alone; it decays on its own via its short TTL.
  if (request.cookies.has("privy-token")) return NextResponse.next();

  const bounceCount = currentAuthLoopBounceCount(request);
  const loopDetected = isAuthLoopDetected(bounceCount);

  const target = request.nextUrl.clone();
  target.pathname = loopDetected
    ? isAppDomain
      ? "/os-sign-in"
      : "/sign-in"
    : request.cookies.has("privy-session")
      ? "/refresh"
      : isAppDomain
        ? "/os-sign-in"
        : "/sign-in";
  target.search = "";
  target.searchParams.set("redirect_url", redirectPath);
  if (loopDetected) target.searchParams.set("session_issue", "1");

  return withAuthLoopCookie(
    NextResponse.redirect(target),
    bounceCount,
    loopDetected,
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
