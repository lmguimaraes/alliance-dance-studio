import "dotenv/config";

const DEFAULT_GRAPH_VERSION = "v26.0";
const GRAPH_BASE_URL = "https://graph.instagram.com";
const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
const graphVersion = /^v\d+\.\d+$/.test(
  process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() ?? ""
)
  ? process.env.INSTAGRAM_GRAPH_API_VERSION!.trim()
  : DEFAULT_GRAPH_VERSION;

if (!token) {
  console.error(
    "INSTAGRAM_ACCESS_TOKEN is missing. Add it to .env before running this script."
  );
  process.exitCode = 1;
} else {
  void main(token);
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function request(
  accessToken: string,
  path: string,
  query: Record<string, string>
): Promise<unknown> {
  const url = new URL(
    `${GRAPH_BASE_URL}/${graphVersion}/${path.replace(/^\/+/, "")}`
  );
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function resolveUserId(accessToken: string): Promise<string> {
  const configured = process.env.INSTAGRAM_USER_ID?.trim();
  if (configured) return configured;

  const payload = await request(accessToken, "me", {
    fields: "user_id,username",
  });
  if (!isRecord(payload)) throw new Error("Invalid /me response.");

  const first = Array.isArray(payload.data)
    ? payload.data.find(isRecord)
    : undefined;
  const candidate = first ?? payload;
  const userId = readString(candidate.user_id) || readString(candidate.id);

  if (!userId) {
    throw new Error(
      "The API did not return a user ID. Set INSTAGRAM_USER_ID in .env."
    );
  }

  return userId;
}

function shortCaption(value: unknown): string {
  const caption = readString(value).replace(/\s+/g, " ");
  if (!caption) return "(no caption)";
  return caption.length > 72 ? `${caption.slice(0, 69)}...` : caption;
}

async function main(accessToken: string): Promise<void> {
  try {
    const userId = await resolveUserId(accessToken);
    const payload = await request(accessToken, `${userId}/media`, {
      fields: "id,caption,media_type,permalink,timestamp",
      limit: "100",
    });

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new Error("The media endpoint returned an unexpected response.");
    }

    const rows = payload.data.filter(isRecord).map(item => ({
      date: readString(item.timestamp).slice(0, 10),
      type: readString(item.media_type),
      id: readString(item.id),
      caption: shortCaption(item.caption),
      url: readString(item.permalink),
    }));

    console.table(rows);
    console.log(
      "\nCopy the IDs of the posts currently pinned on the Instagram profile into:"
    );
    console.log("INSTAGRAM_PINNED_MEDIA_IDS=id1,id2,id3");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unable to list Instagram media."
    );
    process.exitCode = 1;
  }
}
