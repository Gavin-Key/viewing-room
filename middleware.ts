import { NextResponse, type NextRequest } from 'next/server';

// The LAN entry (server/entry.mjs, port 8080) owns network-share routes and its
// session cookie. Direct backend bookmarks on port 8443 must enter through it too;
// forwarded app requests already carry the entry host.
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (host.endsWith(':8443')) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = host.slice(0, -':8443'.length).replace(/^\[|\]$/g, '');
    target.port = '8080';
    return NextResponse.redirect(target, 307);
  }
  return NextResponse.next();
}
