import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/server/auth";

const publicPaths = new Set([
  "/login",
  "/register",
  "/sitemap.xml",
]);
const privacyPolicyPaths = new Set([
  "/es/politica-de-privacidad",
  "/en/privacy-policy",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (privacyPolicyPaths.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/home" || pathname.startsWith("/home/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/leads" ||
    pathname.startsWith("/leads/") ||
    pathname === "/activity" ||
    pathname.startsWith("/activity/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    const executionId = request.nextUrl.searchParams.get("execution");
    if (
      executionId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        executionId,
      )
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/b/${executionId}`;
      url.searchParams.delete("execution");
      return NextResponse.redirect(url);
    }
  }

  const session = await auth();
  const isPublic = publicPaths.has(pathname);

  if (!session?.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (session?.user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
