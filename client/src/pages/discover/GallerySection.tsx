import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Images, Instagram, Play } from "lucide-react";
import { BRAND, PATHS } from "@/lib/brand";
import { trpc } from "@/lib/trpc";

type Post = {
  id: string;
  mediaType: "image" | "video" | "carousel";
  previewUrl: string | null;
  permalink: string;
  altText: string;
};

function InstagramTile({ post }: { post: Post }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const label =
    post.mediaType === "video"
      ? t("discover.gallery.openReel")
      : t("discover.gallery.openPost");

  return (
    <li className="instagram-tile">
      <a
        href={post.permalink}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label}: ${post.altText}`}
      >
        {post.previewUrl && !failed ? (
          <img
            src={post.previewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="instagram-tile__fallback" aria-hidden="true">
            <Instagram />
          </span>
        )}
        {post.mediaType !== "image" && (
          <span className="instagram-tile__type" aria-hidden="true">
            {post.mediaType === "video" ? <Play /> : <Images />}
          </span>
        )}
      </a>
    </li>
  );
}

function InstagramFeed() {
  const { t } = useTranslation();
  const query = trpc.site.instagram.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const data = query.data;
  const posts: Post[] = [];
  const seen = new Set<string>();
  for (const post of [...(data?.pinned ?? []), ...(data?.recent ?? [])]) {
    if (seen.has(post.id) || posts.length >= 9) continue;
    seen.add(post.id);
    posts.push(post);
  }
  const profileUrl = data?.profileUrl ?? BRAND.instagramUrl;
  const handle = data?.username ?? BRAND.instagramHandle;

  return (
    <section className="gallery-block" aria-labelledby="instagram-title">
      <div className="gallery-block__header">
        <h2 id="instagram-title" className="section-title">
          {t("discover.gallery.instagramTitle")}
        </h2>
        <a
          className="button button--outline button--small"
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Instagram aria-hidden="true" />@{handle}
        </a>
      </div>
      {query.isLoading ? (
        <ul className="instagram-grid" role="list" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="instagram-tile skeleton" />
          ))}
        </ul>
      ) : posts.length ? (
        <ul className="instagram-grid" role="list">
          {posts.map(post => (
            <InstagramTile key={post.id} post={post} />
          ))}
        </ul>
      ) : (
        <p className="gallery-block__empty">
          {t("discover.gallery.instagramEmpty")}{" "}
          <a
            className="text-link"
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
          >
            @{handle}
          </a>
        </p>
      )}
    </section>
  );
}

function StudioSpaces() {
  const { t } = useTranslation();
  const query = trpc.site.studios.useQuery();
  const studios = query.data ?? [];

  return (
    <section className="gallery-block" aria-labelledby="studios-title">
      <div className="gallery-block__header">
        <h2 id="studios-title" className="section-title">
          {t("discover.gallery.studiosTitle")}
        </h2>
        <Link
          href={PATHS.rental}
          className="button button--outline button--small"
        >
          {t("discover.gallery.bookStudio")}
        </Link>
      </div>
      {query.isLoading ? (
        <ul className="studio-photos" role="list" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="studio-photo skeleton" />
          ))}
        </ul>
      ) : (
        <ul className="studio-photos" role="list">
          {studios.map(studio => (
            <li key={studio.id} className="studio-photo">
              <div className="studio-photo__frame">
                {studio.imageUrl ? (
                  <img
                    src={studio.imageUrl}
                    alt={studio.name}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="studio-photo__monogram" aria-hidden="true">
                    {studio.name.replace(/^studio\s*/i, "") || studio.name}
                  </span>
                )}
              </div>
              <div className="studio-photo__caption">
                <h3 className="studio-photo__name">{studio.name}</h3>
                {studio.capacity ? (
                  <p className="studio-photo__facts">
                    {t("rental.capacity", { count: studio.capacity })}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function GallerySection() {
  return (
    <div className="gallery">
      <InstagramFeed />
      <StudioSpaces />
    </div>
  );
}
