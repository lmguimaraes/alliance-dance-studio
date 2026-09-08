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

// OAuth state is created and validated server-side; the client never handles it.
export const getLoginUrl = (): string => "/api/oauth/login";
