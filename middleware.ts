import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "./lib/auth";

// Rotas chamadas pela Twilio validam a assinatura dela em vez da sessão.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/voice", "/api/recording"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return new NextResponse("Configure APP_PASSWORD e SESSION_SECRET.", { status: 500 });
  }
  if (req.cookies.get(SESSION_COOKIE)?.value === (await sessionToken())) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
