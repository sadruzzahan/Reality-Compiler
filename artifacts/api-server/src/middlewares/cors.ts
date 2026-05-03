import cors, { type CorsOptions } from "cors";
import type { RequestHandler } from "express";

const isProduction = process.env.NODE_ENV === "production";

function parseAllowed(): string[] {
  const raw = process.env["ALLOWED_ORIGINS"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Dev-only convenience: allow localhost and Replit dev/repl/app hostnames so
// that the workspace preview iframe and local tools can call the API. In
// production we require either an exact match against ALLOWED_ORIGINS or an
// exact match against this server's own forwarded host.
const DEV_ALLOW = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/0\.0\.0\.0(:\d+)?$/,
  /^https?:\/\/[^/]+\.replit\.dev$/i,
  /^https?:\/\/[^/]+\.repl\.co$/i,
  /^https?:\/\/[^/]+\.replit\.app$/i,
];

function sameHostAsRequest(
  origin: string,
  forwardedHost: string | undefined,
): boolean {
  if (!forwardedHost) return false;
  try {
    const u = new URL(origin);
    return u.host.toLowerCase() === forwardedHost.toLowerCase();
  } catch {
    return false;
  }
}

function originAllowed(
  origin: string,
  allow: string[],
  forwardedHost: string | undefined,
): boolean {
  if (allow.includes(origin)) return true;
  // Same-origin requests routed through the Replit proxy carry the public
  // hostname in `x-forwarded-host`; allow those so the production frontend
  // served on the same domain can call the API. This is strictly host-equal,
  // not a wildcard.
  if (sameHostAsRequest(origin, forwardedHost)) return true;
  if (!isProduction && DEV_ALLOW.some((re) => re.test(origin))) return true;
  return false;
}

export function corsMiddleware(): RequestHandler {
  const allow = parseAllowed();
  const options: CorsOptions = {
    credentials: true,
    origin: false,
    maxAge: 600,
  };
  // The cors package doesn't pass the request to the origin callback in a
  // typed way, so we wrap it to look at `x-forwarded-host` per request.
  return (req, res, next) => {
    const forwarded = req.headers["x-forwarded-host"];
    const rawHost = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const forwardedHost =
      rawHost?.split(",")[0]?.trim() || req.headers.host?.trim() || undefined;
    cors({
      ...options,
      origin(origin, cb) {
        // Same-origin / non-browser callers (curl, server-to-server) have no
        // Origin header.
        if (!origin) return cb(null, true);
        if (originAllowed(origin, allow, forwardedHost)) return cb(null, true);
        // Reject silently — without Access-Control-Allow-Origin headers, the
        // browser blocks the response.
        return cb(null, false);
      },
    })(req, res, next);
  };
}
