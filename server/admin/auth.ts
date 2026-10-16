import { createHash, timingSafeEqual } from "node:crypto";
import { parse as parseCookies } from "cookie";
import type { CookieOptions, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { ENV } from "../_core/env";

export const ADMIN_COOKIE = "alliance_admin";
const SESSION_HOURS = 8;
const AUDIENCE = "alliance-admin";

function signingKey(): Uint8Array {
  if (ENV.sessionSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(ENV.sessionSecret);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Changing ADMIN_PASSWORD signs every existing admin session out. */
function passwordVersion(): string {
  return sha256(`alliance-admin:${ENV.adminPassword}`)
    .toString("hex")
    .slice(0, 16);
}

export function passwordMatches(candidate: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(ENV.adminPassword));
}

function cookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: ENV.isProduction || req.secure,
    path: "/",
  };
}

export async function startAdminSession(
  req: Request,
  res: Response
): Promise<void> {
  const token = await new SignJWT({ pv: passwordVersion() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ENV.appUrl)
    .setAudience(AUDIENCE)
    .setSubject("admin")
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(signingKey());

  res.cookie(ADMIN_COOKIE, token, {
    ...cookieOptions(req),
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
}

export function endAdminSession(req: Request, res: Response): void {
  res.clearCookie(ADMIN_COOKIE, cookieOptions(req));
}

export async function isAdminRequest(req: Request): Promise<boolean> {
  const header = req.headers.cookie;
  if (!header) return false;
  const token = parseCookies(header)[ADMIN_COOKIE];
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      issuer: ENV.appUrl,
      audience: AUDIENCE,
      subject: "admin",
    });
    return payload.pv === passwordVersion();
  } catch {
    return false;
  }
}
