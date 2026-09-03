import { NextResponse, type NextRequest } from "next/server";
import { AUTH_LOOP_COOKIE, AUTH_LOOP_WINDOW_SECONDS, parseAuthLoopBounceCount } from "./app/lib/auth-loop-guard";
import { isWalletAuthConfigured } from "./app/lib/auth-config";
import { decideProxyAction, type ProxyRequestFacts } from "./app/lib/proxy-decision";

// This file only ever does two things: read facts off the real request,
// and translate decideProxyAction's decision into a real response. The
// actual routing/redirect/auth-loop judgment calls all live in
// proxy-decision.ts, where they're covered by proxy-decision.test.mjs -
// this adapter is intentionally too thin to need its own tests.

function readFacts(request: NextRequest): ProxyRequestFacts {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return {
    host: forwardedHost ?? request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasPrivyToken: request.cookies.has("privy-token"),
    hasPrivySession: request.cookies.has("privy-session"),
    walletAuthConfigured: isWalletAuthConfigured(),
    authLoopBounceCount: parseAuthLoopBounceCount(
      request.cookies.get(AUTH_LOOP_COOKIE)?.value,
    ),
  };
}

export default function proxy(request: NextRequest) {
  const decision = decideProxyAction(readFacts(request));

  if (decision.kind === "next") return NextResponse.next();

  if (decision.kind === "rewrite") {
    const target = request.nextUrl.clone();
    target.pathname = decision.pathname;
    return NextResponse.rewrite(target);
  }

  const target = request.nextUrl.clone();
  target.pathname = decision.pathname;
  if (decision.query.mode === "replace") {
    target.search = "";
    for (const [key, value] of Object.entries(decision.query.params)) {
      target.searchParams.set(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(decision.query.add)) {
      target.searchParams.set(key, value);
    }
  }

  const response = NextResponse.redirect(target);
  if (decision.authLoopCookie?.action === "set") {
    response.cookies.set(AUTH_LOOP_COOKIE, decision.authLoopCookie.value, {
      maxAge: AUTH_LOOP_WINDOW_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else if (decision.authLoopCookie?.action === "clear") {
    response.cookies.delete(AUTH_LOOP_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
