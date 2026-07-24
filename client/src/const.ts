export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "Alliance Dance";

export const BRAND_LOGOS = {
  alliance: {
    vertical: "/logos/alliance-gold-vertical.webp",
    horizontal: "/logos/alliance-gold-horizontal.webp",
    whiteVertical: "/logos/alliance-white-vertical.webp",
    whiteHorizontal: "/logos/alliance-white-horizontal.webp",
  },
  danceCo: {
    vertical: "/logos/alliance-dance-co-burgundy-vertical.webp",
    horizontal: "/logos/alliance-dance-co-burgundy-horizontal.webp",
  },
} as const;

export const APP_LOGO = BRAND_LOGOS.alliance.horizontal;

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    return "#";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${oauthPortalUrl}/app-auth`);

  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
