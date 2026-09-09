import { useCallback, useEffect, useMemo, useState } from "react";
import { uniqueStudiosByName } from "@shared/studioCatalog";

type SegmentStatus = "available" | "booked" | "closed" | "past";
type Interval = { start: number; end: number };
type Segment = Interval & { status: SegmentStatus };
type DisplaySlot = Interval & { status: SegmentStatus };

type StudioAvailability = {
  id: number;
  name: string;
  description: string | null;
  capacity: number;
  size: string;
  scheduleConfigured: boolean;
  segments: Segment[];
  availableWindows: Interval[];
  nextAvailable: Interval | null;
  availableMinutes: number;
};

type AvailabilityResponse = {
  date: string;
  today: string;
  timeZone: string;
  generatedAt: string;
  range: {
    start: number;
    end: number;
    stepMinutes: number;
  };
  studios: StudioAvailability[];
};

const SLOT_MINUTES = 30;

const statusClass: Record<SegmentStatus, string> = {
  available: "bg-emerald-500",
  booked: "bg-neutral-400",
  closed: "bg-neutral-100",
  past: "bg-neutral-200",
};

const slotClass: Record<SegmentStatus, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-900",
  booked: "border-neutral-300 bg-neutral-200 text-neutral-600",
  closed: "border-neutral-200 bg-white text-neutral-400",
  past: "border-neutral-200 bg-neutral-100 text-neutral-400",
};

const statusLabel: Record<SegmentStatus, string> = {
  available: "Available",
  booked: "Reserved",
  closed: "Closed",
  past: "Past",
};

function torontoToday(): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts()
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function timeLabel(minutes: number): string {
  if (minutes === 1440) return "12:00 AM";

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function compactTimeParts(minutes: number): {
  value: string;
  period: "AM" | "PM";
} {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const displayHour = hour % 12 || 12;

  return {
    value: minute === 0 ? String(displayHour) : `${displayHour}:30`,
    period: hour >= 12 ? "PM" : "AM",
  };
}

function compactDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} hr`;

  return `${hours} hr ${remainder} min`;
}

function overlaps(
  segment: Segment,
  start: number,
  end: number
): boolean {
  return start < segment.end && end > segment.start;
}

function statusForSlot(
  segments: Segment[],
  start: number,
  end: number
): SegmentStatus {
  const matching = segments.filter(segment =>
    overlaps(segment, start, end)
  );

  if (!matching.length) return "closed";

  if (matching.some(segment => segment.status === "booked")) {
    return "booked";
  }

  if (matching.some(segment => segment.status === "closed")) {
    return "closed";
  }

  if (matching.some(segment => segment.status === "past")) {
    return "past";
  }

  return "available";
}

function buildDisplaySlots(
  segments: Segment[],
  range: AvailabilityResponse["range"]
): DisplaySlot[] {
  const slots: DisplaySlot[] = [];

  const firstStart =
    Math.ceil(range.start / SLOT_MINUTES) * SLOT_MINUTES;

  for (
    let start = firstStart;
    start + SLOT_MINUTES <= range.end;
    start += SLOT_MINUTES
  ) {
    const end = start + SLOT_MINUTES;

    slots.push({
      start,
      end,
      status: statusForSlot(segments, start, end),
    });
  }

  return slots;
}

function Timeline({
  segments,
  range,
  studioName,
}: {
  segments: Segment[];
  range: AvailabilityResponse["range"];
  studioName: string;
}) {
  const duration = Math.max(1, range.end - range.start);

  const ticks = [
    range.start,
    Math.round((range.start + range.end) / 2 / 30) * 30,
    range.end,
  ];

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 ring-1 ring-inset ring-black/5"
        role="img"
        aria-label={`${studioName} availability timeline`}
      >
        {segments.map((segment, index) => (
          <span
            key={`${segment.start}-${segment.end}-${segment.status}-${index}`}
            className={`${statusClass[segment.status]} border-r border-white/60 last:border-r-0`}
            style={{
              width: `${
                ((segment.end - segment.start) / duration) * 100
              }%`,
            }}
            title={`${timeLabel(segment.start)}–${timeLabel(
              segment.end
            )}: ${segment.status}`}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] font-medium text-neutral-500">
        {ticks.map((tick, index) => (
          <span key={`${tick}-${index}`}>
            {timeLabel(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function StudioAvailabilityBoard() {
  const today = useMemo(torontoToday, []);

  const [date, setDate] = useState(today);
  const [data, setData] =
    useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/studio-availability?date=${encodeURIComponent(
            date
          )}`,
          {
            signal,
            headers: {
              Accept: "application/json",
            },
          }
        );

        const payload =
          (await response.json().catch(() => null)) as
            | AvailabilityResponse
            | { error?: string }
            | null;

        if (!response.ok) {
          throw new Error(
            payload &&
              "error" in payload &&
              payload.error
              ? payload.error
              : "Availability could not be loaded."
          );
        }

        setData(payload as AvailabilityResponse);
      } catch (cause) {
        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        ) {
          return;
        }

        setData(null);

        setError(
          cause instanceof Error
            ? cause.message
            : "Availability could not be loaded."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [date]
  );

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal);

    return () => controller.abort();
  }, [load, refreshKey]);

  useEffect(() => {
    if (date !== today) return;

    const timer = window.setInterval(
      () => setRefreshKey(value => value + 1),
      30_000
    );

    return () => window.clearInterval(timer);
  }, [date, today]);

  const maxDate = useMemo(
    () => shiftDate(today, 60),
    [today]
  );

  const visibleStudios = useMemo<StudioAvailability[]>(
    () => uniqueStudiosByName<StudioAvailability>(data?.studios ?? []),
    [data?.studios]
  );

  return (
    <section
      id="studio-availability"
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Plan before you book
              </p>

              <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                Studio availability
              </h2>

              <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
                See every 30-minute time across all studios.
                Reserved times are greyed out and active
                checkout holds update automatically.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="grid grid-cols-[2.75rem_1fr_2.75rem] overflow-hidden rounded-xl border border-neutral-300 bg-white">
                <button
                  type="button"
                  className="min-h-11 border-r border-neutral-300 text-xl text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Previous day"
                  disabled={date <= today}
                  onClick={() =>
                    setDate(value =>
                      shiftDate(value, -1)
                    )
                  }
                >
                  ‹
                </button>

                <input
                  type="date"
                  value={date}
                  min={today}
                  max={maxDate}
                  onChange={event =>
                    event.target.value &&
                    setDate(event.target.value)
                  }
                  className="min-h-11 min-w-0 bg-white px-3 text-sm font-medium text-neutral-900 outline-none"
                  aria-label="Availability date"
                />

                <button
                  type="button"
                  className="min-h-11 border-l border-neutral-300 text-xl text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Next day"
                  disabled={date >= maxDate}
                  onClick={() =>
                    setDate(value =>
                      shiftDate(value, 1)
                    )
                  }
                >
                  ›
                </button>
              </div>

              {date !== today && (
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className="min-h-11 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 transition hover:border-primary/40 hover:bg-primary/5"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-neutral-600">
            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Available
            </span>

            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-neutral-400" />
              Reserved
            </span>

            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-neutral-100 ring-1 ring-inset ring-neutral-200" />
              Closed or past
            </span>

            <span className="ml-auto text-neutral-500">
              Toronto time
            </span>
          </div>
        </div>

        <div
          className="bg-neutral-50/70 px-5 py-6 sm:px-8 sm:py-8"
          aria-live="polite"
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-neutral-950 sm:text-lg">
              {readableDate(date)}
            </h3>

            <button
              type="button"
              onClick={() =>
                setRefreshKey(value => value + 1)
              }
              className="text-xs font-semibold text-neutral-600 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-950"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div
              className="grid gap-4 lg:grid-cols-2"
              role="status"
              aria-label="Loading studio availability"
            >
              {[0, 1, 2, 3].map(item => (
                <div
                  key={item}
                  className="h-72 animate-pulse rounded-2xl border border-neutral-200 bg-white"
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
              <p className="font-semibold text-neutral-900">
                Availability is temporarily unavailable
              </p>

              <p className="mt-2 text-sm text-neutral-600">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  setRefreshKey(value => value + 1)
                }
                className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Try again
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            visibleStudios.length === 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">
                No active studios are configured.
              </div>
            )}

          {!loading &&
            !error &&
            data &&
            visibleStudios.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleStudios.map(studio => {
                  const slots = buildDisplaySlots(
                    studio.segments,
                    data.range
                  );

                  return (
                    <article
                      key={studio.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6"
                    >
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-lg font-semibold tracking-tight text-neutral-950">
                            {studio.name}
                          </h4>

                          <p className="mt-1 text-xs font-medium text-neutral-500">
                            {studio.size} · Up to{" "}
                            {studio.capacity}{" "}
                            {studio.capacity === 1
                              ? "person"
                              : "people"}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                            studio.nextAvailable
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {studio.nextAvailable
                            ? `${compactDuration(
                                studio.availableMinutes
                              )} open`
                            : "No openings"}
                        </span>
                      </div>

                      {studio.scheduleConfigured ? (
                        <>
                          <Timeline
                            segments={studio.segments}
                            range={data.range}
                            studioName={studio.name}
                          />

                          <div className="mt-5">
                            <div className="flex items-end justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                                30-minute times
                              </p>

                              <p className="text-[11px] font-medium text-neutral-500">
                                Green is available
                              </p>
                            </div>

                            <div
                              className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6"
                              role="list"
                              aria-label={`${studio.name} 30-minute availability`}
                            >
                              {slots.map(slot => {
                                const label =
                                  compactTimeParts(
                                    slot.start
                                  );

                                return (
                                  <span
                                    key={slot.start}
                                    role="listitem"
                                    aria-label={`${timeLabel(
                                      slot.start
                                    )} to ${timeLabel(
                                      slot.end
                                    )}: ${
                                      statusLabel[
                                        slot.status
                                      ]
                                    }`}
                                    title={`${timeLabel(
                                      slot.start
                                    )}–${timeLabel(
                                      slot.end
                                    )} · ${
                                      statusLabel[
                                        slot.status
                                      ]
                                    }`}
                                    className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                      slotClass[
                                        slot.status
                                      ]
                                    }`}
                                  >
                                    <span>
                                      {label.value}
                                    </span>

                                    <span className="text-[9px] font-bold tracking-wide opacity-70">
                                      {label.period}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl bg-neutral-50 px-4 py-5 text-sm text-neutral-600">
                          Hours have not been configured
                          for this day.
                        </div>
                      )}

                      <a
                        href="#reservation-form"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent(
                              "alliance:studio-selected",
                              {
                                detail: {
                                  studioId: studio.id,
                                  date,
                                },
                              }
                            )
                          )
                        }
                        className="group mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
                      >
                        Choose {studio.name}

                        <span
                          aria-hidden="true"
                          className="transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </a>
                    </article>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </section>
  );
}