import { NextResponse, type NextRequest } from "next/server";
import { isWalletAuthConfigured } from "./app/lib/auth-config";
import {
  AUTH_LOOP_COOKIE,
  AUTH_LOOP_WINDOW_SECONDS,
  parseAuthLoopBounceCount,
} from "./app/lib/auth-loop-guard";
import { resolveProxyAction } from "./app/lib/proxy-routing";

export default function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  const action = resolveProxyAction({
    host,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    walletAuthConfigured: isWalletAuthConfigured(),
    hasPrivyToken: request.cookies.has("privy-token"),
    hasPrivySession: request.cookies.has("privy-session"),
    authLoopBounceCount: parseAuthLoopBounceCount(
      request.cookies.get(AUTH_LOOP_COOKIE)?.value,
    ),
  });

  if (action.kind === "next") return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = action.pathname;

  if (action.kind === "rewrite") {
    return NextResponse.rewrite(target);
  }

  if (!action.preserveSearch) {
    target.search = "";
  }
  if (action.redirectParam) {
    target.searchParams.set("redirect_url", action.redirectParam);
  }
  if (action.sessionIssue) {
    target.searchParams.set("session_issue", "1");
  }

  const response = NextResponse.redirect(target);
  if (action.authLoopCookie?.action === "set") {
    response.cookies.set(AUTH_LOOP_COOKIE, action.authLoopCookie.value, {
      maxAge: AUTH_LOOP_WINDOW_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else if (action.authLoopCookie?.action === "clear") {
    response.cookies.delete(AUTH_LOOP_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
