import { NextResponse, type NextRequest } from "next/server";
import { isWalletAuthConfigured } from "./app/lib/auth-config";
import {
  isAllowedGwapAppPath,
  isGwapAppHostname,
} from "./app/lib/app-domain-routing";

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
      const target = request.nextUrl.clone();
      target.pathname = "/os-sign-in";
      return NextResponse.redirect(target);
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
  if (request.cookies.has("privy-token")) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = request.cookies.has("privy-session")
    ? "/refresh"
    : isAppDomain
      ? "/os-sign-in"
      : "/sign-in";
  target.search = "";
  target.searchParams.set("redirect_url", redirectPath);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
