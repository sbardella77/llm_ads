import { NextResponse, type NextRequest } from "next/server";

// Controllo veloce sul cookie; la sessione vera si verifica nel server con requireUser().
export function middleware(request: NextRequest) {
  if (!request.cookies.has("llmads_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
