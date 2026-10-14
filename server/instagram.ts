const DEFAULT_USERNAME = "alliancedancecompany";
const DEFAULT_GRAPH_VERSION = "v26.0";
const DEFAULT_CACHE_TTL_SECONDS = 10 * 60;
const MIN_CACHE_TTL_SECONDS = 60;
const MAX_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 8_000;
const STALE_CACHE_WINDOW_MS = 6 * 60 * 60 * 1000;
const GRAPH_BASE_URL = "https://graph.instagram.com";

export type InstagramGalleryPost = {
  id: string;
  caption: string;
  mediaType: "image" | "video" | "carousel";
  previewUrl: string | null;
  permalink: string;
  timestamp: string;
  username: string;
  altText: string;
};

export type InstagramGalleryResponse = {
  status: "live" | "stale" | "not_configured" | "unavailable";
  username: string;
  profileUrl: string;
  pinned: InstagramGalleryPost[];
  recent: InstagramGalleryPost[];
  fetchedAt: string | null;
  stale: boolean;
};

type RawInstagramChild = {
  media_type?: unknown;
  media_url?: unknown;
  thumbnail_url?: unknown;
};

export type RawInstagramMedia = {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  thumbnail_url?: unknown;
  permalink?: unknown;
  timestamp?: unknown;
  username?: unknown;
  children?: {
    data?: unknown;
  } | null;
};

type InstagramIdentity = {
  userId: string;
  username: string;
};

type CachedGallery = {
  response: InstagramGalleryResponse;
  storedAt: number;
  expiresAt: number;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readHttpsUrl(value: unknown): string {
  const candidate = readString(value);
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function readInstagramPermalink(value: unknown): string {
  const candidate = readHttpsUrl(value);
  if (!candidate) return "";

  const hostname = new URL(candidate).hostname.toLowerCase();
  return hostname === "instagram.com" || hostname.endsWith(".instagram.com")
    ? candidate
    : "";
}

function readUsername(value: string | undefined): string {
  const username = readString(value).replace(/^@/, "");
  return /^[A-Za-z0-9._]+$/.test(username) ? username : DEFAULT_USERNAME;
}

function readGraphVersion(value: string | undefined): string {
  const version = readString(value);
  return /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION;
}

function readCacheTtlMs(value: string | undefined): number {
  const parsed = Number.parseInt(readString(value), 10);
  const seconds = Number.isInteger(parsed)
    ? Math.min(
        MAX_CACHE_TTL_SECONDS,
        Math.max(MIN_CACHE_TTL_SECONDS, parsed)
      )
    : DEFAULT_CACHE_TTL_SECONDS;

  return seconds * 1000;
}

export function parsePinnedMediaIds(value: string | undefined): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const candidate of readString(value).split(",")) {
    const id = candidate.trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;

    seen.add(id);
    ids.push(id);
    if (ids.length === 3) break;
  }

  return ids;
}

const config = {
  accessToken: readString(process.env.INSTAGRAM_ACCESS_TOKEN),
  userId: readString(process.env.INSTAGRAM_USER_ID),
  username: readUsername(process.env.INSTAGRAM_USERNAME),
  pinnedMediaIds: parsePinnedMediaIds(
    process.env.INSTAGRAM_PINNED_MEDIA_IDS
  ),
  graphVersion: readGraphVersion(process.env.INSTAGRAM_GRAPH_API_VERSION),
  cacheTtlMs: readCacheTtlMs(process.env.INSTAGRAM_CACHE_TTL_SECONDS),
};

let cachedGallery: CachedGallery | null = null;
let activeRequest: Promise<InstagramGalleryResponse> | null = null;
let resolvedIdentity: InstagramIdentity | null = null;
let retryAfter = 0;

function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

function emptyResponse(
  status: InstagramGalleryResponse["status"]
): InstagramGalleryResponse {
  return {
    status,
    username: config.username,
    profileUrl: profileUrl(config.username),
    pinned: [],
    recent: [],
    fetchedAt: null,
    stale: status === "stale",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphErrorMessage(payload: unknown, status: number): string {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return `Instagram API request failed with HTTP ${status}.`;
  }

  const code = payload.error.code;
  const message = payload.error.message;
  const codeText = typeof code === "number" ? `, code ${code}` : "";
  const messageText =
    typeof message === "string" && message.trim()
      ? `: ${message.trim()}`
      : "";

  return `Instagram API request failed with HTTP ${status}${codeText}${messageText}`;
}

async function graphRequest(
  path: string,
  query: Record<string, string>
): Promise<unknown> {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(
    `${GRAPH_BASE_URL}/${config.graphVersion}/${normalizedPath}`
  );

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(graphErrorMessage(payload, response.status));
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function identityFromPayload(payload: unknown): InstagramIdentity | null {
  if (!isRecord(payload)) return null;

  const firstDataItem = Array.isArray(payload.data)
    ? payload.data.find(isRecord)
    : null;
  const candidate = firstDataItem ?? payload;
  const userId = readString(candidate.user_id) || readString(candidate.id);
  const username = readUsername(readString(candidate.username));

  return userId ? { userId, username } : null;
}

async function getIdentity(): Promise<InstagramIdentity> {
  if (resolvedIdentity) return resolvedIdentity;

  if (config.userId) {
    resolvedIdentity = {
      userId: config.userId,
      username: config.username,
    };
    return resolvedIdentity;
  }

  const payload = await graphRequest("me", {
    fields: "user_id,username",
  });
  const identity = identityFromPayload(payload);

  if (!identity) {
    throw new Error(
      "Instagram API did not return a user ID. Set INSTAGRAM_USER_ID explicitly."
    );
  }

  resolvedIdentity = identity;
  return identity;
}

function childMedia(media: RawInstagramMedia): RawInstagramChild[] {
  const children = media.children?.data;
  if (!Array.isArray(children)) return [];

  return children.filter(isRecord) as RawInstagramChild[];
}

function childPreviewUrl(media: RawInstagramMedia): string {
  for (const child of childMedia(media)) {
    const childType = readString(child.media_type).toUpperCase();
    const image =
      childType === "VIDEO"
        ? readHttpsUrl(child.thumbnail_url) || readHttpsUrl(child.media_url)
        : readHttpsUrl(child.media_url) || readHttpsUrl(child.thumbnail_url);

    if (image) return image;
  }

  return "";
}

function normalizeMediaType(
  value: unknown
): InstagramGalleryPost["mediaType"] {
  const mediaType = readString(value).toUpperCase();
  if (mediaType === "VIDEO" || mediaType === "REELS") return "video";
  if (mediaType.includes("CAROUSEL")) return "carousel";
  return "image";
}

function captionToAltText(caption: string, username: string): string {
  const compactCaption = caption.replace(/\s+/g, " ").trim();
  if (!compactCaption) return `Instagram post from @${username}`;

  return compactCaption.length > 160
    ? `${compactCaption.slice(0, 157)}...`
    : compactCaption;
}

export function normalizeInstagramMedia(
  media: RawInstagramMedia,
  fallbackUsername = DEFAULT_USERNAME
): InstagramGalleryPost | null {
  const id = readString(media.id);
  const permalink = readInstagramPermalink(media.permalink);
  const timestamp = readString(media.timestamp);

  if (
    !id ||
    !permalink ||
    !timestamp ||
    Number.isNaN(Date.parse(timestamp))
  ) {
    return null;
  }

  const mediaType = normalizeMediaType(media.media_type);
  const username = readUsername(readString(media.username) || fallbackUsername);
  const caption = readString(media.caption);
  const previewUrl =
    mediaType === "video"
      ? readHttpsUrl(media.thumbnail_url) ||
        readHttpsUrl(media.media_url) ||
        childPreviewUrl(media)
      : readHttpsUrl(media.media_url) ||
        childPreviewUrl(media) ||
        readHttpsUrl(media.thumbnail_url);

  return {
    id,
    caption,
    mediaType,
    previewUrl: previewUrl || null,
    permalink,
    timestamp,
    username,
    altText: captionToAltText(caption, username),
  };
}

function mediaArrayFromPayload(payload: unknown): RawInstagramMedia[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.filter(isRecord) as RawInstagramMedia[];
}

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "username",
  "children{media_type,media_url,thumbnail_url}",
].join(",");

async function fetchRecentMedia(userId: string): Promise<RawInstagramMedia[]> {
  const payload = await graphRequest(`${userId}/media`, {
    fields: MEDIA_FIELDS,
    limit: "24",
  });

  return mediaArrayFromPayload(payload);
}

async function fetchMediaById(id: string): Promise<RawInstagramMedia | null> {
  const payload = await graphRequest(id, { fields: MEDIA_FIELDS });
  return isRecord(payload) ? (payload as RawInstagramMedia) : null;
}

function sortNewestFirst(
  left: InstagramGalleryPost,
  right: InstagramGalleryPost
): number {
  return Date.parse(right.timestamp) - Date.parse(left.timestamp);
}

async function loadLiveGallery(): Promise<InstagramGalleryResponse> {
  const identity = await getIdentity();
  const rawRecentMedia = await fetchRecentMedia(identity.userId);
  const rawById = new Map<string, RawInstagramMedia>();

  for (const media of rawRecentMedia) {
    const id = readString(media.id);
    if (id) rawById.set(id, media);
  }

  const pinnedRaw: RawInstagramMedia[] = [];
  for (const id of config.pinnedMediaIds) {
    const existing = rawById.get(id);
    if (existing) {
      pinnedRaw.push(existing);
      continue;
    }

    try {
      const fetched = await fetchMediaById(id);
      if (fetched) pinnedRaw.push(fetched);
    } catch (error) {
      console.warn("Unable to load an Instagram pinned post", {
        mediaId: id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const pinned = pinnedRaw
    .map(media => normalizeInstagramMedia(media, identity.username))
    .filter((post): post is InstagramGalleryPost => post !== null);
  const recent = rawRecentMedia
    .map(media => normalizeInstagramMedia(media, identity.username))
    .filter((post): post is InstagramGalleryPost => post !== null)
    .sort(sortNewestFirst)
    .slice(0, 3);
  const username = identity.username || config.username;

  return {
    status: "live",
    username,
    profileUrl: profileUrl(username),
    pinned,
    recent,
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

async function refreshGallery(): Promise<InstagramGalleryResponse> {
  const now = Date.now();

  try {
    const response = await loadLiveGallery();
    cachedGallery = {
      response,
      storedAt: now,
      expiresAt: now + config.cacheTtlMs,
    };
    retryAfter = 0;
    return response;
  } catch (error) {
    console.error("Instagram gallery refresh failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    retryAfter = now + 60_000;

    if (
      cachedGallery &&
      now - cachedGallery.storedAt <= STALE_CACHE_WINDOW_MS
    ) {
      return {
        ...cachedGallery.response,
        status: "stale",
        stale: true,
      };
    }

    return emptyResponse("unavailable");
  }
}

export async function getInstagramGallery(): Promise<InstagramGalleryResponse> {
  if (!config.accessToken) return emptyResponse("not_configured");

  const now = Date.now();
  if (cachedGallery && cachedGallery.expiresAt > now) {
    return cachedGallery.response;
  }

  if (retryAfter > now) {
    if (
      cachedGallery &&
      now - cachedGallery.storedAt <= STALE_CACHE_WINDOW_MS
    ) {
      return {
        ...cachedGallery.response,
        status: "stale",
        stale: true,
      };
    }

    return emptyResponse("unavailable");
  }

  if (activeRequest) return activeRequest;

  activeRequest = refreshGallery();
  try {
    return await activeRequest;
  } finally {
    activeRequest = null;
  }
}
