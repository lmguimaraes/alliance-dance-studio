import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  LockKeyhole,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const DEFAULT_RULES = {
  stepMinutes: 30,
  minimumMinutes: 60,
  maximumMinutes: 8 * 60,
  timeZone: "America/Toronto",
} as const;

type Audience = "private" | "group";

type StudioOption = {
  key: string;
  studioIds: number[];
  name: string;
  description: string;
  capacity: number | null;
  privateHourlyRate: number;
  groupHourlyRate: number;
};

type Confirmation = {
  reservationId: string;
  status: "checkout_pending" | "paid" | "expired" | "cancelled";
  date: string;
  startTime: string;
  endTime: string;
  studioIds: number[];
  studioNames: string[];
  amountTotal: number;
  currency: string;
  audience: Audience;
};

type StartChoice = {
  time: string;
  disabled: boolean;
  reason?: "booked" | "past";
};

const inputClass =
  "mt-2 w-full rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return (
    timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB)
  );
}

function dateKeyInTimeZone(
  date: Date,
  timeZone = DEFAULT_RULES.timeZone
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(dateKey: string, locale: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function durationLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

function findStudioByName<T extends { name: string }>(
  studios: T[],
  name: string
): T | undefined {
  const target = name.trim().toLowerCase();
  return studios.find(studio => studio.name.trim().toLowerCase() === target);
}

export default function StudioRental() {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const today = useMemo(() => dateKeyInTimeZone(new Date()), []);
  const latestDate = useMemo(() => addDaysToDateKey(today, 60), [today]);

  const [selectedStudioKey, setSelectedStudioKey] = useState("");
  const [date, setDate] = useState(() => addDaysToDateKey(today, 1));
  const [audience, setAudience] = useState<Audience>("private");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<"cancelled" | null>(null);
  const [contact, setContact] = useState({
    userName: "",
    userEmail: "",
    userPhone: "",
    specialRequests: "",
  });

  const checkoutState = useMemo(
    () => new URLSearchParams(window.location.search).get("checkout"),
    []
  );
  const checkoutSessionId = useMemo(
    () => new URLSearchParams(window.location.search).get("session_id"),
    []
  );

  const studiosQuery = trpc.studios.list.useQuery();
  const studioOptions = useMemo<StudioOption[]>(() => {
    const studios = studiosQuery.data ?? [];
    const singles = studios.map(studio => ({
      key: String(studio.id),
      studioIds: [studio.id],
      name: studio.name,
      description: studio.description || "Private studio rental.",
      capacity: studio.capacity,
      privateHourlyRate: studio.hourlyRate,
      groupHourlyRate: studio.groupHourlyRate ?? studio.hourlyRate,
    }));

    const studio6 = findStudioByName(studios, "Studio 6");
    const studio7 = findStudioByName(studios, "Studio 7");
    if (!studio6 || !studio7) return singles;

    const comboIds = [studio6.id, studio7.id].sort((a, b) => a - b);
    return [
      ...singles,
      {
        key: comboIds.join("-"),
        studioIds: comboIds,
        name: `${studio6.name} + ${studio7.name}`,
        description: "Reserve both connected studios as one larger space.",
        capacity: (studio6.capacity ?? 0) + (studio7.capacity ?? 0) || null,
        privateHourlyRate: studio6.hourlyRate + studio7.hourlyRate,
        groupHourlyRate:
          (studio6.groupHourlyRate ?? studio6.hourlyRate) +
          (studio7.groupHourlyRate ?? studio7.hourlyRate),
      },
    ];
  }, [studiosQuery.data]);

  useEffect(() => {
    if (!selectedStudioKey && studioOptions[0]) {
      setSelectedStudioKey(studioOptions[0].key);
    }
  }, [selectedStudioKey, studioOptions]);

  const selectedStudio = studioOptions.find(
    option => option.key === selectedStudioKey
  );
  const scheduleQuery = trpc.bookings.schedule.useQuery(
    {
      studioIds: selectedStudio?.studioIds ?? [],
      date,
    },
    {
      enabled: Boolean(selectedStudio && date),
      staleTime: 15_000,
      refetchInterval: 30_000,
    }
  );
  const rules = scheduleQuery.data?.rules ?? DEFAULT_RULES;
  const currency = scheduleQuery.data?.currency ?? "cad";

  useEffect(() => {
    setStartTime("");
    setDurationMinutes(0);
  }, [selectedStudioKey, date]);

  const startChoices = useMemo<StartChoice[]>(() => {
    const schedule = scheduleQuery.data;
    if (!schedule) return [];

    const choices: StartChoice[] = [];
    for (const segment of schedule.availability) {
      const segmentStart = timeToMinutes(segment.startTime);
      const lastStart = timeToMinutes(segment.endTime) - rules.minimumMinutes;
      for (let value = segmentStart; value <= lastStart; value += rules.stepMinutes) {
        const time = minutesToTime(value);
        const minimumEnd = minutesToTime(value + rules.minimumMinutes);
        const isPast = Boolean(
          schedule.earliestStartTime &&
            value < timeToMinutes(schedule.earliestStartTime)
        );
        const isBooked = schedule.busy.some(blocked =>
          overlaps(time, minimumEnd, blocked.startTime, blocked.endTime)
        );
        choices.push({
          time,
          disabled: isPast || isBooked,
          reason: isPast ? "past" : isBooked ? "booked" : undefined,
        });
      }
    }
    return choices;
  }, [rules.minimumMinutes, rules.stepMinutes, scheduleQuery.data]);

  const durationOptions = useMemo(() => {
    const schedule = scheduleQuery.data;
    if (!schedule || !startTime) return [];

    const start = timeToMinutes(startTime);
    const containingWindow = schedule.availability.find(
      segment =>
        start >= timeToMinutes(segment.startTime) &&
        start < timeToMinutes(segment.endTime)
    );
    if (!containingWindow) return [];

    const maximum = Math.min(
      rules.maximumMinutes,
      timeToMinutes(containingWindow.endTime) - start
    );
    const durations: number[] = [];
    for (
      let duration = rules.minimumMinutes;
      duration <= maximum;
      duration += rules.stepMinutes
    ) {
      const end = minutesToTime(start + duration);
      const hasConflict = schedule.busy.some(blocked =>
        overlaps(startTime, end, blocked.startTime, blocked.endTime)
      );
      if (hasConflict) break;
      durations.push(duration);
    }
    return durations;
  }, [rules.maximumMinutes, rules.minimumMinutes, rules.stepMinutes, scheduleQuery.data, startTime]);

  useEffect(() => {
    if (!durationOptions.includes(durationMinutes)) {
      setDurationMinutes(durationOptions[0] ?? 0);
    }
  }, [durationMinutes, durationOptions]);

  const endTime = startTime && durationMinutes
    ? minutesToTime(timeToMinutes(startTime) + durationMinutes)
    : "";
  const hourlyRate = selectedStudio
    ? audience === "group"
      ? selectedStudio.groupHourlyRate
      : selectedStudio.privateHourlyRate
    : 0;
  const estimatedTotal = Math.round((hourlyRate * durationMinutes) / 60);

  const createCheckout = trpc.bookings.createCheckout.useMutation({
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
    onError: error => {
      toast.error(error.message || "Unable to start payment checkout.");
      void utils.bookings.schedule.invalidate();
    },
  });
  const confirmCheckout = trpc.bookings.confirmCheckout.useMutation();
  const cancelCheckout = trpc.bookings.cancelCheckout.useMutation();
  const confirmationStarted = useRef(false);
  const cancellationStarted = useRef(false);

  useEffect(() => {
    if (
      checkoutState !== "success" ||
      !checkoutSessionId ||
      confirmationStarted.current
    ) {
      return;
    }

    confirmationStarted.current = true;
    void confirmCheckout
      .mutateAsync({ sessionId: checkoutSessionId })
      .then(result => {
        setConfirmation(result);
        toast.success(
          result.status === "paid"
            ? "Payment received. Your studio is reserved."
            : "Payment is still processing."
        );
        void utils.bookings.schedule.invalidate();
      })
      .catch(error => {
        toast.error(error.message || "Unable to verify the payment.");
      })
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      });
  }, [checkoutSessionId, checkoutState, confirmCheckout, utils.bookings.schedule]);

  useEffect(() => {
    if (checkoutState !== "cancelled" || cancellationStarted.current) return;
    cancellationStarted.current = true;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const reservationId = hash.get("reservation_id");
    const cancelToken = hash.get("cancel_token");
    setCheckoutNotice("cancelled");

    const finish = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
      void utils.bookings.schedule.invalidate();
    };

    if (!reservationId || !cancelToken) {
      finish();
      return;
    }

    void cancelCheckout
      .mutateAsync({ reservationId, cancelToken })
      .then(result => {
        if (result.status === "paid") {
          setConfirmation(result);
          setCheckoutNotice(null);
          toast.success("Your payment completed and the studio is reserved.");
        } else {
          toast.message("Checkout cancelled. The temporary hold was released.");
        }
      })
      .catch(() => {
        toast.message("Checkout cancelled. Any temporary hold will expire shortly.");
      })
      .finally(finish);
  }, [cancelCheckout, checkoutState, utils.bookings.schedule]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedStudio || !startTime || !endTime || !durationMinutes) {
      toast.error("Choose a studio, date, start time, and duration.");
      return;
    }

    createCheckout.mutate({
      studioIds: selectedStudio.studioIds,
      date,
      startTime,
      endTime,
      audience,
      userName: contact.userName,
      userEmail: contact.userEmail,
      userPhone: contact.userPhone || undefined,
      specialRequests: contact.specialRequests || undefined,
    });
  }

  return (
    <div className="brand-shell min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.16),_transparent_38%)]" />
          <div className="container relative py-16 md:py-24">
            <p className="eyebrow">{t("studioRental.title", { defaultValue: "Studio rental" })}</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
              {t("studioRental.paymentTitle", {
                defaultValue: "Choose a time, reserve it, and pay securely.",
              })}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {t("studioRental.paymentSubtitle", {
                defaultValue:
                  "Live availability is held while you complete Stripe Checkout. Paid reservations immediately become unavailable to other customers.",
              })}
            </p>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container">
            {confirmation && (
              <div className="mb-8 rounded-[2rem] border border-primary/40 bg-primary/10 p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <h2 className="text-xl font-semibold">
                      {confirmation.status === "paid"
                        ? "Reservation confirmed"
                        : "Payment processing"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {confirmation.studioNames.join(" + ")} · {formatDate(confirmation.date, i18n.language)} · {confirmation.startTime}-{confirmation.endTime}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {formatMoney(
                        confirmation.amountTotal,
                        confirmation.currency,
                        i18n.language
                      )}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Reference: {confirmation.reservationId}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {checkoutNotice === "cancelled" && !confirmation && (
              <div className="mb-8 rounded-[2rem] border border-border bg-card/70 p-6">
                <h2 className="font-semibold">Checkout cancelled</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  No payment was taken. Your temporary time hold is being released.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-8">
                <section className="rounded-[2rem] border border-border bg-card/70 p-6 md:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">1</span>
                    <h2 className="text-2xl font-semibold">{t("studioRental.selectStudio", { defaultValue: "Choose a studio" })}</h2>
                  </div>

                  {studiosQuery.isLoading ? (
                    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading studios
                    </div>
                  ) : studiosQuery.error ? (
                    <p className="py-8 text-sm text-destructive">
                      {studiosQuery.error.message}
                    </p>
                  ) : (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      {studioOptions.map(option => {
                        const selected = option.key === selectedStudioKey;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedStudioKey(option.key)}
                            className={`rounded-3xl border p-5 text-left transition ${
                              selected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                                : "border-border bg-background/60 hover:border-primary/50"
                            }`}
                          >
                            <h3 className="font-semibold">{option.name}</h3>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {option.description}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {option.capacity && <span>Up to {option.capacity} people</span>}
                              <span>
                                From {formatMoney(option.privateHourlyRate, currency, i18n.language)}/h
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-[2rem] border border-border bg-card/70 p-6 md:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">2</span>
                    <h2 className="text-2xl font-semibold">{t("studioRental.selectTime", { defaultValue: "Choose a date and time" })}</h2>
                  </div>

                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-medium">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Date</span>
                      <input
                        className={inputClass}
                        type="date"
                        min={today}
                        max={latestDate}
                        value={date}
                        onChange={event => setDate(event.target.value)}
                        required
                      />
                    </label>
                    <div>
                      <span className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-primary" /> Rental type</span>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(["private", "group"] as Audience[]).map(value => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={audience === value}
                            onClick={() => setAudience(value)}
                            className={`rounded-2xl border px-4 py-3 text-sm capitalize transition ${
                              audience === value
                                ? "border-primary bg-primary/10 font-semibold"
                                : "border-border bg-background/60"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-primary" /> Start time</span>
                      <span className="text-xs text-muted-foreground">Grey times are unavailable</span>
                    </div>

                    {scheduleQuery.isFetching && !scheduleQuery.data ? (
                      <div className="mt-4 flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking live availability
                      </div>
                    ) : scheduleQuery.error ? (
                      <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                        {scheduleQuery.error.message}
                      </p>
                    ) : startChoices.length === 0 ? (
                      <p className="mt-4 rounded-2xl border border-border bg-background/50 p-5 text-sm text-muted-foreground">
                        No reservable times are configured for this date.
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                        {startChoices.map(choice => (
                          <button
                            key={choice.time}
                            type="button"
                            disabled={choice.disabled}
                            title={choice.reason === "booked" ? "Already reserved" : choice.reason === "past" ? "Time has passed" : undefined}
                            onClick={() => setStartTime(choice.time)}
                            className={`rounded-xl border px-2 py-2 text-sm transition ${
                              choice.disabled
                                ? "cursor-not-allowed border-border/50 bg-muted/60 text-muted-foreground/45 line-through"
                                : startTime === choice.time
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background/70 hover:border-primary"
                            }`}
                          >
                            {choice.time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {startTime && (
                    <div className="mt-7">
                      <label className="text-sm font-medium">
                        Duration
                        <select
                          className={inputClass}
                          value={durationMinutes}
                          onChange={event => setDurationMinutes(Number(event.target.value))}
                          required
                        >
                          {durationOptions.map(minutes => (
                            <option key={minutes} value={minutes}>
                              {durationLabel(minutes)} · {startTime}-{minutesToTime(timeToMinutes(startTime) + minutes)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </section>

                <section className="rounded-[2rem] border border-border bg-card/70 p-6 md:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">3</span>
                    <h2 className="text-2xl font-semibold">{t("studioRental.bookingForm.title", { defaultValue: "Your details" })}</h2>
                  </div>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-medium">
                      {t("studioRental.bookingForm.name", { defaultValue: "Name" })}
                      <input
                        className={inputClass}
                        autoComplete="name"
                        maxLength={120}
                        minLength={2}
                        value={contact.userName}
                        onChange={event => setContact(current => ({ ...current, userName: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium">
                      {t("studioRental.bookingForm.email", { defaultValue: "Email" })}
                      <input
                        className={inputClass}
                        autoComplete="email"
                        type="email"
                        maxLength={254}
                        value={contact.userEmail}
                        onChange={event => setContact(current => ({ ...current, userEmail: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium sm:col-span-2">
                      {t("studioRental.bookingForm.phone", { defaultValue: "Phone" })} <span className="font-normal text-muted-foreground">(optional)</span>
                      <input
                        className={inputClass}
                        autoComplete="tel"
                        type="tel"
                        maxLength={40}
                        value={contact.userPhone}
                        onChange={event => setContact(current => ({ ...current, userPhone: event.target.value }))}
                      />
                    </label>
                    <label className="text-sm font-medium sm:col-span-2">
                      {t("studioRental.bookingForm.specialRequests", { defaultValue: "Special requests" })} <span className="font-normal text-muted-foreground">(optional)</span>
                      <textarea
                        className={`${inputClass} min-h-28 resize-y`}
                        maxLength={1000}
                        value={contact.specialRequests}
                        onChange={event => setContact(current => ({ ...current, specialRequests: event.target.value }))}
                      />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="lg:sticky lg:top-24 lg:self-start">
                <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm md:p-8">
                  <p className="eyebrow">{t("studioRental.labels.bookingSummary", { defaultValue: "Reservation summary" })}</p>
                  <h2 className="mt-4 text-2xl font-semibold">
                    {selectedStudio?.name || "Choose a studio"}
                  </h2>
                  <dl className="mt-6 space-y-4 text-sm">
                    <div className="flex justify-between gap-4 border-b border-border pb-4">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="text-right font-medium">{date ? formatDate(date, i18n.language) : "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-border pb-4">
                      <dt className="text-muted-foreground">Time</dt>
                      <dd className="font-medium">{startTime && endTime ? `${startTime}-${endTime}` : "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-border pb-4">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="font-medium capitalize">{audience}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-border pb-4">
                      <dt className="text-muted-foreground">Rate</dt>
                      <dd className="font-medium">{formatMoney(hourlyRate, currency, i18n.language)}/h</dd>
                    </div>
                    <div className="flex items-end justify-between gap-4 pt-2">
                      <dt className="font-semibold">{t("studioRental.price.total", { defaultValue: "Total" })}</dt>
                      <dd className="text-2xl font-semibold text-primary">
                        {formatMoney(estimatedTotal, currency, i18n.language)}
                      </dd>
                    </div>
                  </dl>

                  <Button
                    type="submit"
                    size="lg"
                    className="mt-7 w-full rounded-full"
                    disabled={
                      createCheckout.isPending ||
                      !selectedStudio ||
                      !startTime ||
                      !durationMinutes ||
                      scheduleQuery.isFetching
                    }
                  >
                    {createCheckout.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating secure checkout</>
                    ) : (
                      <><CreditCard className="mr-2 h-4 w-4" /> Continue to payment</>
                    )}
                  </Button>

                  <div className="mt-5 flex items-start gap-3 rounded-2xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      Payment is processed on Stripe's hosted checkout. The final price is recalculated securely on the server.
                    </p>
                  </div>
                </div>
              </aside>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
