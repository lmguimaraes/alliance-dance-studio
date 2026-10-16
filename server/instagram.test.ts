import { describe, expect, it } from "vitest";

import { normalizeInstagramMedia, parsePinnedMediaIds } from "./instagram";

describe("parsePinnedMediaIds", () => {
  it("keeps at most three unique numeric IDs", () => {
    expect(parsePinnedMediaIds(" 11,22,11,not-an-id,33,44 ")).toEqual([
      "11",
      "22",
      "33",
    ]);
  });
});

describe("normalizeInstagramMedia", () => {
  it("uses an image URL for image posts", () => {
    const post = normalizeInstagramMedia({
      id: "1",
      caption: "Alliance rehearsal",
      media_type: "IMAGE",
      media_url: "https://cdn.example/image.jpg",
      permalink: "https://www.instagram.com/p/example/",
      timestamp: "2026-09-20T12:00:00+0000",
      username: "alliancedancecompany",
    });

    expect(post).toMatchObject({
      id: "1",
      mediaType: "image",
      previewUrl: "https://cdn.example/image.jpg",
    });
  });

  it("uses a thumbnail for video posts", () => {
    const post = normalizeInstagramMedia({
      id: "2",
      media_type: "VIDEO",
      media_url: "https://cdn.example/video.mp4",
      thumbnail_url: "https://cdn.example/video-cover.jpg",
      permalink: "https://www.instagram.com/reel/example/",
      timestamp: "2026-09-21T12:00:00+0000",
    });

    expect(post).toMatchObject({
      id: "2",
      mediaType: "video",
      previewUrl: "https://cdn.example/video-cover.jpg",
    });
  });

  it("uses the first child image for carousel posts", () => {
    const post = normalizeInstagramMedia({
      id: "3",
      media_type: "CAROUSEL_ALBUM",
      permalink: "https://www.instagram.com/p/carousel/",
      timestamp: "2026-09-22T12:00:00+0000",
      children: {
        data: [
          {
            media_type: "IMAGE",
            media_url: "https://cdn.example/first-slide.jpg",
          },
        ],
      },
    });

    expect(post).toMatchObject({
      id: "3",
      mediaType: "carousel",
      previewUrl: "https://cdn.example/first-slide.jpg",
    });
  });

  it("rejects incomplete media objects", () => {
    expect(normalizeInstagramMedia({ id: "4" })).toBeNull();
  });

  it("rejects unsafe permalink protocols", () => {
    expect(
      normalizeInstagramMedia({
        id: "5",
        media_type: "IMAGE",
        media_url: "https://cdn.example/image.jpg",
        permalink: "javascript:alert(1)",
        timestamp: "2026-09-23T12:00:00+0000",
      })
    ).toBeNull();
  });
});
