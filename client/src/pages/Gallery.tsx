import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Images,
  Instagram,
  Pin,
  Play,
} from "lucide-react";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";

const DEFAULT_INSTAGRAM_PROFILE =
  "https://www.instagram.com/alliancedancecompany/";

type InstagramPost = {
  id: string;
  caption: string;
  mediaType: "image" | "video" | "carousel";
  previewUrl: string | null;
  permalink: string;
  timestamp: string;
  username: string;
  altText: string;
};

type StudioSlide = {
  title: string;
  description: string;
  imageSrc: string | null;
};

const studioSlides: StudioSlide[] = [
  {
    title: "Studio 5",
    description: "Professional dance floor, mirrors, and room to move.",
    imageSrc: null,
  },
  {
    title: "Studio 6",
    description: "A flexible room for classes, rehearsals, and privates.",
    imageSrc: null,
  },
  {
    title: "Studio 7",
    description: "A bright creative space for training and production.",
    imageSrc: null,
  },
  {
    title: "Studio X",
    description: "Studios 6 and 7 combined for larger groups and projects.",
    imageSrc: null,
  },
  {
    title: "The Alliance experience",
    description: "Details, common spaces, and the atmosphere around the studio.",
    imageSrc: null,
  },
];

function formatPostDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function mediaBadge(post: InstagramPost): ReactNode {
  if (post.mediaType === "video") {
    return (
      <>
        <Play className="h-3.5 w-3.5 fill-current" /> Reel
      </>
    );
  }

  if (post.mediaType === "carousel") {
    return (
      <>
        <Images className="h-3.5 w-3.5" /> Carousel
      </>
    );
  }

  return (
    <>
      <Instagram className="h-3.5 w-3.5" /> Post
    </>
  );
}

function InstagramPostCard({
  post,
  emphasized = false,
}: {
  post: InstagramPost;
  emphasized?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const date = formatPostDate(post.timestamp);

  return (
    <article
      className={`group overflow-hidden rounded-[1.75rem] border bg-card transition duration-300 hover:-translate-y-1 hover:border-primary/45 hover:shadow-xl hover:shadow-primary/5 ${
        emphasized ? "border-primary/35" : "border-border"
      }`}
    >
      <a
        href={post.permalink}
        target="_blank"
        rel="noreferrer"
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`Open this post from @${post.username} on Instagram`}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
          {post.previewUrl && !imageFailed ? (
            <img
              src={post.previewUrl}
              alt={post.altText}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_30%_25%,_rgba(138,16,39,0.26),_transparent_35%),linear-gradient(145deg,_var(--secondary),_var(--card))] p-8 text-center">
              <Instagram className="h-10 w-10 text-primary" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                View this post on Instagram
              </p>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
          <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
            {mediaBadge(post)}
          </div>
          <div className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition group-hover:scale-105">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">@{post.username}</span>
            {date && <time dateTime={post.timestamp}>{date}</time>}
          </div>
          <p className="mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-foreground/85">
            {post.caption || "Open the post on Instagram to see more."}
          </p>
        </div>
      </a>
    </article>
  );
}

function PostSkeletonGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map(index => (
        <div
          key={index}
          className="overflow-hidden rounded-[1.75rem] border border-border bg-card"
        >
          <div className="aspect-[4/5] animate-pulse bg-secondary" />
          <div className="space-y-3 p-5">
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-full animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InstagramFallback({
  title,
  description,
  profileUrl,
}: {
  title: string;
  description: string;
  profileUrl: string;
}) {
  return (
    <div className="rounded-[2rem] border border-border bg-card p-8 md:p-10">
      <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Instagram className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Open Instagram
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-9 flex flex-col gap-6 md:mb-11 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <div className="eyebrow flex items-center gap-2">{eyebrow}</div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
          {title}
        </h2>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function StudioCarousel() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollBackward, setCanScrollBackward] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
    setCanScrollBackward(carousel.scrollLeft > 8);
    setCanScrollForward(carousel.scrollLeft < maxScrollLeft - 8);
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    updateScrollButtons();
    carousel.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    return () => {
      carousel.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [updateScrollButtons]);

  function moveCarousel(direction: -1 | 1): void {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.scrollBy({
      left: direction * Math.max(300, carousel.clientWidth * 0.82),
      behavior: "smooth",
    });
  }

  return (
    <>
      <SectionHeading
        eyebrow={
          <>
            <Building2 className="h-4 w-4" /> Our spaces
          </>
        }
        title="Inside Alliance Studio"
        description="A closer look at the rooms where classes, rehearsals, privates, and creative work come to life."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => moveCarousel(-1)}
              disabled={!canScrollBackward}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Previous studio photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => moveCarousel(1)}
              disabled={!canScrollForward}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next studio photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        }
      />

      <div
        ref={carouselRef}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        aria-label="Studio photo carousel"
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveCarousel(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveCarousel(1);
          }
        }}
      >
        {studioSlides.map(slide => (
          <article
            key={slide.title}
            className="group min-w-[86%] snap-start overflow-hidden rounded-[2rem] border border-border bg-card sm:min-w-[58%] lg:min-w-[36%]"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
              {slide.imageSrc ? (
                <img
                  src={slide.imageSrc}
                  alt={slide.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_25%_20%,_rgba(138,16,39,0.24),_transparent_35%),linear-gradient(145deg,_var(--secondary),_var(--card))]">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/25 bg-card/70 text-primary backdrop-blur-sm">
                      <Building2 className="h-7 w-7" />
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                      Photo coming soon
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold">{slide.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {slide.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default function Gallery() {
  const feedQuery = trpc.instagram.gallery.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const profileUrl = feedQuery.data?.profileUrl ?? DEFAULT_INSTAGRAM_PROFILE;
  const username = feedQuery.data?.username ?? "alliancedancecompany";
  const pinned = (feedQuery.data?.pinned ?? []) as InstagramPost[];
  const recent = (feedQuery.data?.recent ?? []) as InstagramPost[];
  const feedUnavailable =
    Boolean(feedQuery.error) ||
    feedQuery.data?.status === "not_configured" ||
    feedQuery.data?.status === "unavailable";

  return (
    <div className="brand-shell">
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(138,16,39,0.16),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.4),_transparent_52%)]" />
          <div className="container relative py-16 md:py-24">
            <div className="max-w-4xl">
              <p className="eyebrow">Gallery</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">
                Alliance Dance, in motion.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                Important updates, recent company moments, and a closer look at
                the spaces where our community moves.
              </p>
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center rounded-full border border-border bg-card/80 px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              >
                <Instagram className="mr-2 h-4 w-4" />@{username}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-secondary/35 py-16 md:py-20">
          <div className="container">
            <SectionHeading
              eyebrow={
                <>
                  <Instagram className="h-4 w-4" /> From Instagram
                </>
              }
              title="The latest from Alliance"
              description="The three newest posts from the company feed, refreshed automatically."
              action={
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  View full Instagram
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              }
            />

            {feedQuery.isLoading ? (
              <PostSkeletonGrid />
            ) : recent.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {recent.map(post => (
                  <InstagramPostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <InstagramFallback
                title={
                  feedUnavailable
                    ? "See the newest posts on Instagram"
                    : "More company moments are coming"
                }
                description="Open the Alliance profile for the latest classes, performances, events, and community updates."
                profileUrl={profileUrl}
              />
            )}
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container">
            <StudioCarousel />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
