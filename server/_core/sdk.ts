import { AXIOS_TIMEOUT_MS, COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const EXCHANGE_TOKEN_PATH =
  "/webdev.v1.WebDevAuthPublicService/ExchangeToken";
const GET_USER_INFO_PATH =
  "/webdev.v1.WebDevAuthPublicService/GetUserInfo";
const GET_USER_INFO_WITH_JWT_PATH =
  "/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt";

function createOAuthHttpClient(): AxiosInstance {
  return axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

class OAuthService {
  constructor(private readonly client: AxiosInstance) {}

  async getTokenByCode(
    code: string,
    redirectUri: string
  ): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    };
    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      { accessToken: token.accessToken }
    );
    return data;
  }
}

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback) return fallback;
    if (!Array.isArray(platforms)) return null;

    const values = new Set(
      platforms.filter((value): value is string => typeof value === "string")
    );
    const known = [
      ["REGISTERED_PLATFORM_EMAIL", "email"],
      ["REGISTERED_PLATFORM_GOOGLE", "google"],
      ["REGISTERED_PLATFORM_APPLE", "apple"],
      ["REGISTERED_PLATFORM_MICROSOFT", "microsoft"],
      ["REGISTERED_PLATFORM_AZURE", "microsoft"],
      ["REGISTERED_PLATFORM_GITHUB", "github"],
    ] as const;

    for (const [platform, label] of known) {
      if (values.has(platform)) return label;
    }
    return values.values().next().value?.toLowerCase() ?? null;
  }

  private getSessionSecret(): Uint8Array {
    if (ENV.cookieSecret.length < 32) {
      throw new Error("JWT_SECRET must contain at least 32 characters.");
    }
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  private parseCookies(cookieHeader: string | undefined): Map<string, string> {
    if (!cookieHeader) return new Map();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, redirectUri);
  }

  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const source = data as GetUserInfoResponse & {
      platforms?: unknown;
      loginMethod?: string | null;
    };
    const loginMethod = this.deriveLoginMethod(
      source.platforms,
      source.loginMethod ?? source.platform ?? null
    );
    return { ...data, platform: loginMethod, loginMethod } as GetUserInfoResponse;
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      { openId, appId: ENV.appId, name: options.name || "" },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? 30 * 24 * 60 * 60 * 1000;

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setIssuer(ENV.appUrl)
      .setAudience(ENV.appId)
      .setSubject(payload.openId)
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(this.getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) return null;

    try {
      const { payload } = await jwtVerify(
        cookieValue,
        this.getSessionSecret(),
        {
          algorithms: ["HS256"],
          issuer: ENV.appUrl,
          audience: ENV.appId,
        }
      );
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (
        !isString(openId) ||
        !openId ||
        !isString(appId) ||
        appId !== ENV.appId ||
        !isString(name)
      ) {
        return null;
      }
      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };
    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const source = data as GetUserInfoWithJwtResponse & {
      platforms?: unknown;
      loginMethod?: string | null;
    };
    const loginMethod = this.deriveLoginMethod(
      source.platforms,
      source.loginMethod ?? source.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<User> {
    const sessionCookie = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session cookie");

    let user = await db.getUserByOpenId(session.openId);
    const signedInAt = new Date();

    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie || "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch {
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) throw ForbiddenError("User not found");
    return user;
  }
}

export const sdk = new SDKServer();
