import { randomBytes, timingSafeEqual } from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getQueryParam(
  req: Request,
  key: string,
  maximumLength: number
): string | undefined {
  const value = req.query[key];
  return typeof value === "string" && value.length <= maximumLength
    ? value
    : undefined;
}

function getCookie(req: Request, name: string): string | undefined {
  if (!req.headers.cookie) return undefined;
  return parseCookieHeader(req.headers.cookie)[name];
}

function stateMatches(received: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const left = Buffer.from(received, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function oauthStateCookieOptions(req: Request) {
  return {
    ...getSessionCookieOptions(req),
    path: "/api/oauth",
  } as const;
}

function callbackUrl(): string {
  return new URL("/api/oauth/callback", ENV.appUrl).toString();
}

export function registerOAuthRoutes(app: Express): void {
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    if (!ENV.oauthPortalUrl || !ENV.appId) {
      res.status(503).json({ error: "OAuth is not configured." });
      return;
    }

    const state = randomBytes(32).toString("base64url");
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...oauthStateCookieOptions(req),
      maxAge: OAUTH_STATE_MAX_AGE_MS,
    });

    const url = new URL("app-auth", `${ENV.oauthPortalUrl}/`);
    url.searchParams.set("appId", ENV.appId);
    url.searchParams.set("redirectUri", callbackUrl());
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code", 4096);
    const state = getQueryParam(req, "state", 256);
    const expectedState = getCookie(req, OAUTH_STATE_COOKIE);

    if (!code || !state || !stateMatches(state, expectedState)) {
      res.status(400).json({ error: "Invalid OAuth callback." });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions(req));

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, callbackUrl());
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "OAuth account is missing an identifier." });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_MAX_AGE_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: SESSION_MAX_AGE_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("OAuth callback failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(502).json({ error: "OAuth sign-in failed." });
    }
  });
}
