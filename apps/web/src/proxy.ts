import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 "proxy" (formerly middleware): decides which screen a request
// may see before any page renders.

const SESSION_COOKIE = 'tp_session';
type Role = 'PASSENGER' | 'DRIVER';

const homeFor = (role: Role) => (role === 'DRIVER' ? '/driver' : '/passenger');

/**
 * Reads the role from the session token WITHOUT verifying its signature. That
 * is deliberate: this only picks a screen. The API verifies every token on
 * every request, so a forged cookie gets past this redirect and then a 401.
 */
function sessionRole(token: string | undefined): Role | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return payload.role === 'DRIVER' || payload.role === 'PASSENGER' ? payload.role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const role = sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Signed-in users skip the landing and auth pages.
  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return role ? redirectTo(homeFor(role)) : NextResponse.next();
  }

  // Everything else matched below is a role area.
  if (!role) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  const areaRole: Role = pathname.startsWith('/driver') ? 'DRIVER' : 'PASSENGER';
  return role === areaRole ? NextResponse.next() : redirectTo(homeFor(role));
}

export const config = {
  matcher: ['/', '/login', '/register', '/passenger/:path*', '/driver/:path*'],
};
