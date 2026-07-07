import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ExternalLink, RotateCcw } from "lucide-react";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday";
type StyleKey = "salsa" | "bachata" | "tango" | "heels";
type LevelKey = "beginner" | "intermediate" | "open";

type ClassItem = {
  id: string;
  day: DayKey;
  time24: string; // "18:00"
  title: string;
  style: StyleKey;
  level: LevelKey;
  tags?: string[];
  instructors?: { handle: string; href?: string }[];
};

type BuyLink = {
  label: string;
  price: string;
  href: string;
};

const DAY_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday"];
const TIME_OPTIONS = ["18:00", "19:00"] as const;

function timeToDisplay(time24: string, locale: string) {
  const [hStr, mStr] = time24.split(":");
  const d = new Date();
  d.setHours(Number(hStr), Number(mStr), 0, 0);

  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
}

function toggleInArray<T>(arr: T[], value: T) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function groupByTime(items: ClassItem[]) {
  const map = new Map<string, ClassItem[]>();
  for (const it of items) {
    const list = map.get(it.time24) ?? [];
    list.push(it);
    map.set(it.time24, list);
  }
  const times = Array.from(map.keys()).sort();
  return times.map((time) => ({ time, items: map.get(time) ?? [] }));
}

export default function Classes() {
  const { t, i18n } = useTranslation();

  // -----------------------------
  // Data (matches your poster)
  // -----------------------------
  const schedule: ClassItem[] = useMemo(
    () => [
      // Monday
      {
        id: "mon-1800-bachata-beginner",
        day: "monday",
        time24: "18:00",
        title: "Bachata Beginner",
        style: "bachata",
        level: "beginner",
        instructors: [{ handle: "jhaimevega", href: "https://instagram.com/jhaimevega" }],
      },
      {
        id: "mon-1900-salsa-on2-beginner",
        day: "monday",
        time24: "19:00",
        title: "Salsa On2 Beginner",
        style: "salsa",
        level: "beginner",
        tags: ["On2"],
      },

      // Tuesday
      {
        id: "tue-1800-salsa-on1-beginner",
        day: "tuesday",
        time24: "18:00",
        title: "Salsa On1 Beginner",
        style: "salsa",
        level: "beginner",
        tags: ["On1"],
      },
      {
        id: "tue-1800-tango-beginner",
        day: "tuesday",
        time24: "18:00",
        title: "Tango Beginner",
        style: "tango",
        level: "beginner",
        instructors: [
          { handle: "tango_organico", href: "https://instagram.com/tango_organico" },
          { handle: "alexander.latorredancer", href: "https://instagram.com/alexander.latorredancer" },
        ],
      },
      {
        id: "tue-1900-salsa-on1-intermediate",
        day: "tuesday",
        time24: "19:00",
        title: "Salsa On1 Intermediate",
        style: "salsa",
        level: "intermediate",
        tags: ["On1"],
        instructors: [{ handle: "sofiamoreenoc", href: "https://instagram.com/sofiamoreenoc" }],
      },

      // Wednesday
      {
        id: "wed-1800-salsa-calena-open",
        day: "wednesday",
        time24: "18:00",
        title: "Salsa Caleña Open",
        style: "salsa",
        level: "open",
        tags: ["Caleña"],
        instructors: [{ handle: "leitow_nunez", href: "https://instagram.com/leitow_nunez" }],
      },
      {
        id: "wed-1800-bachata-fusion-intermediate",
        day: "wednesday",
        time24: "18:00",
        title: "Bachata Fusion Intermediate",
        style: "bachata",
        level: "intermediate",
        tags: ["Fusion"],
        instructors: [{ handle: "g_lucero7", href: "https://instagram.com/g_lucero7" }],
      },
      {
        id: "wed-1900-salsa-on2-intermediate",
        day: "wednesday",
        time24: "19:00",
        title: "Salsa On2 Intermediate",
        style: "salsa",
        level: "intermediate",
        tags: ["On2"],
      },
      {
        id: "wed-1900-bachata-footwork-musicality",
        day: "wednesday",
        time24: "19:00",
        title: "Bachata Footwork & Musicality",
        style: "bachata",
        level: "open",
        tags: ["Footwork"],
        instructors: [{ handle: "joseactor89", href: "https://instagram.com/joseactor89" }],
      },

      // Thursday
      {
        id: "thu-1800-heels",
        day: "thursday",
        time24: "18:00",
        title: "Heels",
        style: "heels",
        level: "open",
      },
      {
        id: "thu-1800-bachata-intermediate",
        day: "thursday",
        time24: "18:00",
        title: "Bachata Intermediate",
        style: "bachata",
        level: "intermediate",
        instructors: [{ handle: "valentina.diaz.al", href: "https://instagram.com/valentina.diaz.al" }],
      },
      {
        id: "thu-1900-salsa-on2-footwork-partnerwork",
        day: "thursday",
        time24: "19:00",
        title: "Salsa On2 Footwork & Partnerwork",
        style: "salsa",
        level: "open",
        tags: ["On2", "Partnerwork"],
        instructors: [{ handle: "alliancestudiomtl", href: "https://instagram.com/alliancestudiomtl" }],
      },
    ],
    []
  );

  // -----------------------------
  // Buy links (from your Linktree)
  // -----------------------------
  const sessionLinks: BuyLink[] = [
    {
      label: "Unlimited Class Pass",
      price: "$249",
      href: "https://buy.stripe.com/28EcN516paqn02W6ew4ZG0b",
    },
    {
      label: "8-Class Pass",
      price: "$160",
      href: "https://buy.stripe.com/5kQ5kD3exaqndTM8mE4ZG0a",
    },
    {
      label: "4-Class Pass",
      price: "$85",
      href: "https://buy.stripe.com/fZu5kD2atgOL5ng6ew4ZG09",
    },
    {
      label: "Drop-In Class",
      price: "$25",
      href: "https://buy.stripe.com/8x2aEX5mFaqn1701Yg4ZG0i",
    },
  ];

  const rehearsalLinks: BuyLink[] = [
    {
      label: "Training Pack",
      price: "$140",
      href: "https://buy.stripe.com/7sYfZh8yR8if6rk32k4ZG0m",
    },
    {
      label: "Single Session",
      price: "$40",
      href: "https://buy.stripe.com/fZu8wPg1jaqn5nggTa4ZG0l",
    },
  ];

  // -----------------------------
  // Filters
  // -----------------------------
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<DayKey[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [styles, setStyles] = useState<StyleKey[]>([]);
  const [levels, setLevels] = useState<LevelKey[]>([]);

  const hasActiveFilters =
    query.trim().length > 0 || days.length > 0 || times.length > 0 || styles.length > 0 || levels.length > 0;

  const dayLabel = (day: DayKey) =>
    t(`academyClasses.days.${day}`, {
      defaultValue:
        day === "monday" ? "Monday" : day === "tuesday" ? "Tuesday" : day === "wednesday" ? "Wednesday" : "Thursday",
    });

  const styleLabel = (s: StyleKey) =>
    t(`academyClasses.styles.${s}`, {
      defaultValue: s === "salsa" ? "Salsa" : s === "bachata" ? "Bachata" : s === "tango" ? "Tango" : "Heels",
    });

  const levelLabel = (l: LevelKey) =>
    t(`academyClasses.levels.${l}`, {
      defaultValue: l === "beginner" ? "Beginner" : l === "intermediate" ? "Intermediate" : "Open",
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return schedule.filter((c) => {
      if (days.length > 0 && !days.includes(c.day)) return false;
      if (times.length > 0 && !times.includes(c.time24)) return false;
      if (styles.length > 0 && !styles.includes(c.style)) return false;
      if (levels.length > 0 && !levels.includes(c.level)) return false;

      if (q) {
        const haystack = [
          c.title,
          c.style,
          c.level,
          ...(c.tags ?? []),
          ...(c.instructors?.map((i) => i.handle) ?? []),
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [schedule, query, days, times, styles, levels]);

  const filteredByDay = useMemo(() => {
    const bucket: Record<DayKey, ClassItem[]> = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
    };

    for (const c of filtered) bucket[c.day].push(c);

    return DAY_ORDER.map((day) => ({
      day,
      items: bucket[day].sort((a, b) => (a.time24 === b.time24 ? a.title.localeCompare(b.title) : a.time24.localeCompare(b.time24))),
    })).filter((d) => d.items.length > 0);
  }, [filtered]);

  const resetFilters = () => {
    setQuery("");
    setDays([]);
    setTimes([]);
    setStyles([]);
    setLevels([]);
  };

  const FilterChip = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full border text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:border-primary/50"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );

  return (
    // To demo DARK academy variant: change academy-theme -> academy-theme-dark
    <div className="academy-theme min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="academy-hero py-14">
          <div className="container">
            <div className="flex flex-col items-center text-center gap-4">
              <img src="/logo-academy-horizontal.webp" alt="Alliance Academy" className="h-12 md:h-14 w-auto" />

              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-primary">
                {t("academyClasses.title", { defaultValue: "Classes" })}
              </h1>

              <p className="text-base md:text-lg text-muted-foreground max-w-3xl">
                {t("academyClasses.subtitle", {
                  defaultValue: "Filter by day/time/style and buy your pass online.",
                })}
              </p>

              <p className="text-sm text-muted-foreground">
                {t("academyClasses.sessionRange", { defaultValue: "Session: March 9th to April 30th" })}
              </p>
            </div>
          </div>
        </section>

        {/* 3-column layout */}
        <section className="py-12">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* 1) Filters */}
              <Card className="academy-card border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    1. {t("academyClasses.cards.filters", { defaultValue: "Filters" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {t("academyClasses.filters.search", { defaultValue: "Search" })}
                    </div>
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("academyClasses.filters.searchPlaceholder", {
                        defaultValue: "e.g. bachata, tango, on2, instructor…",
                      })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("academyClasses.filters.day", { defaultValue: "Day" })}</div>
                    <div className="flex flex-wrap gap-2">
                      {DAY_ORDER.map((d) => (
                        <FilterChip key={d} active={days.includes(d)} onClick={() => setDays(toggleInArray(days, d))}>
                          {dayLabel(d)}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("academyClasses.filters.time", { defaultValue: "Time" })}</div>
                    <div className="flex flex-wrap gap-2">
                      {TIME_OPTIONS.map((time) => (
                        <FilterChip
                          key={time}
                          active={times.includes(time)}
                          onClick={() => setTimes(toggleInArray(times, time))}
                        >
                          {timeToDisplay(time, i18n.language)}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("academyClasses.filters.style", { defaultValue: "Style" })}</div>
                    <div className="flex flex-wrap gap-2">
                      {(["salsa", "bachata", "tango", "heels"] as StyleKey[]).map((s) => (
                        <FilterChip
                          key={s}
                          active={styles.includes(s)}
                          onClick={() => setStyles(toggleInArray(styles, s))}
                        >
                          {styleLabel(s)}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("academyClasses.filters.level", { defaultValue: "Level" })}</div>
                    <div className="flex flex-wrap gap-2">
                      {(["beginner", "intermediate", "open"] as LevelKey[]).map((l) => (
                        <FilterChip
                          key={l}
                          active={levels.includes(l)}
                          onClick={() => setLevels(toggleInArray(levels, l))}
                        >
                          {levelLabel(l)}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">
                      {t("academyClasses.filters.results", {
                        defaultValue: "Showing {{count}} classes",
                        count: filtered.length,
                      })}
                    </div>

                    <Button type="button" variant="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t("academyClasses.filters.reset", { defaultValue: "Reset" })}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 2) Schedule */}
              <Card className="academy-card border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    2. {t("academyClasses.cards.schedule", { defaultValue: "Schedule" })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {filteredByDay.length === 0 ? (
                    <div className="rounded-lg border border-border p-6 text-center space-y-3">
                      <div className="font-medium">
                        {t("academyClasses.messages.noResultsTitle", { defaultValue: "No classes match your filters." })}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("academyClasses.messages.noResultsHint", { defaultValue: "Try clearing a filter or reset." })}
                      </div>
                      <Button type="button" variant="secondary" onClick={resetFilters}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {t("academyClasses.filters.reset", { defaultValue: "Reset" })}
                      </Button>
                    </div>
                  ) : (
                    <ScrollArea className="h-[520px] pr-3">
                      <div className="space-y-8">
                        {filteredByDay.map((dayBlock) => {
                          const byTime = groupByTime(dayBlock.items);
                          return (
                            <div key={dayBlock.day} className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold">{dayLabel(dayBlock.day)}</h4>
                              </div>

                              <div className="space-y-3">
                                {byTime.map((slot) => (
                                  <div key={slot.time} className="rounded-lg border border-border bg-card p-4">
                                    <div className="text-sm font-semibold text-primary">
                                      {timeToDisplay(slot.time, i18n.language)}
                                    </div>

                                    <div className="mt-3 space-y-3">
                                      {slot.items.map((c) => (
                                        <div key={c.id} className="rounded-md border border-border/60 p-3">
                                          <div className="font-medium">{c.title}</div>

                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                                              {styleLabel(c.style)}
                                            </span>
                                            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                                              {levelLabel(c.level)}
                                            </span>
                                            {(c.tags ?? []).map((tag) => (
                                              <span
                                                key={tag}
                                                className="text-xs px-2 py-1 rounded-full bg-accent text-accent-foreground border border-border"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>

                                          {!!c.instructors?.length && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {c.instructors.map((ins) => (
                                                <a
                                                  key={ins.handle}
                                                  href={ins.href ?? `https://instagram.com/${ins.handle}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                                >
                                                  @{ins.handle}
                                                </a>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* 3) Buy */}
              <Card className="academy-card border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    3. {t("academyClasses.cards.buy", { defaultValue: "Buy a pass" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="font-semibold">
                      {t("academyClasses.buy.sessionTitle", { defaultValue: "Session (Mar 9 - Apr 30)" })}
                    </h4>

                    <div className="space-y-2">
                      {sessionLinks.map((link) => (
                        <Button key={link.href} asChild className="w-full justify-between">
                          <a href={link.href} target="_blank" rel="noopener noreferrer">
                            <span className="text-left">{link.label}</span>
                            <span className="flex items-center gap-2 text-primary-foreground/80">
                              {link.price} <ExternalLink className="h-4 w-4" />
                            </span>
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">
                      {t("academyClasses.buy.rehearsalTitle", { defaultValue: "Open Rehearsal (Mar 7 - Mar 28)" })}
                    </h4>

                    <div className="space-y-2">
                      {rehearsalLinks.map((link) => (
                        <Button key={link.href} asChild variant="secondary" className="w-full justify-between">
                          <a href={link.href} target="_blank" rel="noopener noreferrer">
                            <span className="text-left">{link.label}</span>
                            <span className="flex items-center gap-2">
                              {link.price} <ExternalLink className="h-4 w-4" />
                            </span>
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t("academyClasses.buy.note", {
                      defaultValue: "You’ll be redirected to Stripe to complete your purchase securely.",
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}