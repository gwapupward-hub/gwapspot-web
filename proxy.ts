import { NextResponse, type NextRequest } from "next/server";
import { isWalletAuthConfigured } from "./app/lib/auth-config";

export default function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();

  if (hostname === "app.gwapspot.com" && request.nextUrl.pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = "/os-entry";
    return NextResponse.rewrite(target);
  }

  if (!request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  if (!isWalletAuthConfigured()) return NextResponse.next();

  const redirectPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (request.cookies.has("privy-token")) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = request.cookies.has("privy-session") ? "/refresh" : "/sign-in";
  target.search = "";
  target.searchParams.set("redirect_url", redirectPath);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/", "/app/:path*"],
};
