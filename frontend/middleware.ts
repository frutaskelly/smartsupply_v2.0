import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based routing. El mismo frontend de v2 sirve app.smartsupply.mx y
 * admin.smartsupply.mx; en el host `admin.*` reescribimos cualquier ruta al
 * panel /admin (que de todas formas está gateado por operador en el backend).
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  const isAdminHost = host.startsWith("admin.");
  const { pathname } = req.nextUrl;

  if (isAdminHost && !pathname.startsWith("/admin")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye assets de Next y estáticos para no reescribir el bundle.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
