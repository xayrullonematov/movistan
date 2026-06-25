import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";
const COOKIE_NAME = "demo_auth";

export function middleware(request: NextRequest) {
  // Skip if no password configured
  if (!DEMO_PASSWORD) return NextResponse.next();

  // Skip static assets and the gate page itself
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/gate"
  ) {
    return NextResponse.next();
  }

  // Handle gate form submission
  if (pathname === "/api/gate" && request.method === "POST") {
    return; // Handled by the route
  }

  // Check auth cookie
  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === DEMO_PASSWORD) {
    return NextResponse.next();
  }

  // Redirect to gate
  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
