export const BRAND = {
  name: "Alliance Dance",
  email: "info@alliancedance.ca",
  instagramHandle: "alliancedancecompany",
  instagramUrl: "https://www.instagram.com/alliancedancecompany/",
  facebookName: "Alliance Dance Company",
  facebookUrl: "https://www.facebook.com/alliancedancemtl/",
  logos: {
    header: "/logos/alliance-gold-horizontal-header.webp",
    large: "/logos/alliance-gold-horizontal-admin.webp",
    mark: "/logos/alliance-gold-mark.webp",
  },
} as const;

export const DISCOVER_SECTIONS = [
  "directors",
  "company",
  "dancers",
  "story",
  "awards",
  "teams",
  "gallery",
] as const;

export type DiscoverSectionKey = (typeof DISCOVER_SECTIONS)[number];

export function isDiscoverSection(value: string): value is DiscoverSectionKey {
  return (DISCOVER_SECTIONS as readonly string[]).includes(value);
}

export const PATHS = {
  home: "/",
  discover: (section: DiscoverSectionKey = "story") => `/discover/${section}`,
  classes: "/classes",
  rental: "/studio-rental",
  checkout: "/studio-rental/checkout",
  contact: "/contact",
  admin: "/admin",
} as const;

/** The four parts of Alliance, on the home page and in the footer. */
export const AREAS = [
  { key: "academy", href: PATHS.classes },
  { key: "company", href: PATHS.discover("company") },
  { key: "studios", href: PATHS.rental },
  { key: "productions", href: PATHS.discover("gallery") },
] as const;
