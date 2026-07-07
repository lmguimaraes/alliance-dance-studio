import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  User,
  Users,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link, useLocation } from "wouter";

/**
 * DEV MODE:
 * - true => localStorage studios/bookings (no backend)
 * - false => uses your trpc queries/mutations.
 *
 * Note:
 * The redesigned overview works best in local dev, because the public API only exposes
 * bookings for one studio + one date at a time. In production mode this page still
 * shows schedule-based overview first, then exact time availability once a date is chosen.
 */
const USE_LOCAL_DEV = true;

// Booking rules
const START_STEP_MINUTES = 30;
const DURATION_STEP_MINUTES = 30;
const MIN_DURATION_MINUTES = 60;
const MAX_DURATION_MINUTES = 8 * 60;

// Date window
const MAX_ADVANCE_DAYS = 60;

// Fallback hours if timeSlots aren't configured / not returned yet
const FALLBACK_OPEN_MIN = 9 * 60; // 09:00
const FALLBACK_CLOSE_MIN = 22 * 60; // 22:00

// Pricing (CAD, in cents)
// Update these four values to match the studio's final approved rates.
const SINGLE_RATE_PRIVATE_CENTS = 1500;
const SINGLE_RATE_GROUP_CENTS = 2200;
const COMBO_RATE_PRIVATE_CENTS = 3000;
const COMBO_RATE_GROUP_CENTS = 4400;

// Special UI-only option id for "Studio 6 + 7 together"
const COMBO_OPTION_ID = 67;

type BookingAudience = "private" | "group";
type ReservationSidebarTab = "booking" | "checkout";
type Segment = { start: number; end: number }; // minutes since midnight, [start, end)

type LocalBooking = {
  id: string;
  studioId: number;

  userName: string;
  userEmail: string;
  userPhone?: string;

  bookingDate: string; // ISO (date marker)
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"

  specialRequests?: string;
  status: "pending" | "confirmed" | "cancelled";
  groupId?: string;
};

type Studio = {
  id: number;
  name: string;
  description: string;
  hourlyRate: number; // cents
  image?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type StudioOption = {
  id: number;
  name: string;
  description: string;
  hourlyRates: Record<BookingAudience, number>;
  availabilityStudioIds: number[];
  showInOverview: boolean;
};

type CartItem = {
  id: string;
  optionId: number;
  optionName: string;
  studioIds: number[];

  bookingAudience: BookingAudience;

  dateKey: string;
  dateIso: string;

  startTime: string;
  endTime: string;
  durationMinutes: number;

  hourlyRateCents: number;
  totalPriceCents: number;

  seriesId?: string;
};

const LOCAL_BOOKINGS_KEY = "dev_studio_bookings";
const LOCAL_CART_KEY = "studio_rental_cart_v2";

const LOCAL_STUDIOS: Studio[] = [
  {
    id: 5,
    name: "Studio 5",
    description: "Bright studio for solo practice, private lessons, and rehearsals.",
    hourlyRate: SINGLE_RATE_PRIVATE_CENTS,
    image: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 6,
    name: "Studio 6",
    description: "Flexible room for coaching sessions, rehearsals, and small groups.",
    hourlyRate: SINGLE_RATE_PRIVATE_CENTS,
    image: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 7,
    name: "Studio 7",
    description: "Spacious room suited to classes, events, and larger rehearsals.",
    hourlyRate: SINGLE_RATE_PRIVATE_CENTS,
    image: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getLocalBookings(): LocalBooking[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<LocalBooking[]>(localStorage.getItem(LOCAL_BOOKINGS_KEY), []);
}

function saveLocalBookings(bookings: LocalBooking[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(bookings));
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createLocalBooking(booking: Omit<LocalBooking, "id">) {
  const all = getLocalBookings();
  const newBooking: LocalBooking = { ...booking, id: makeId() };
  all.push(newBooking);
  saveLocalBookings(all);
  return newBooking;
}

function timeToMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}


function dateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toNoonIso(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];

  for (const seg of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...seg });
      continue;
    }
    if (seg.start <= last.end) last.end = Math.max(last.end, seg.end);
    else out.push({ ...seg });
  }

  return out;
}

function intersectSegments(a: Segment[], b: Segment[]): Segment[] {
  const A = mergeSegments(a);
  const B = mergeSegments(b);

  const out: Segment[] = [];
  let i = 0;
  let j = 0;

  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (start < end) out.push({ start, end });

    if (A[i].end < B[j].end) i++;
    else j++;
  }

  return mergeSegments(out);
}

function buildSegmentsFromTimeSlots(timeSlots: any[] | undefined, selectedDate: Date): Segment[] {
  if (!timeSlots) return [];
  const dow = selectedDate.getDay();
  const daySlots = timeSlots
    .filter((slot: any) => slot.dayOfWeek === dow && slot.isAvailable)
    .map((slot: any) => ({
      start: timeToMinutes(slot.startTime),
      end: timeToMinutes(slot.endTime),
    }))
    .sort((a: Segment, b: Segment) => a.start - b.start);

  return mergeSegments(daySlots);
}

function sharesAnyStudio(a: number[], b: number[]) {
  return a.some((id) => b.includes(id));
}

function buildBookingTypeNote(audience: BookingAudience, specialRequests: string) {
  const prefix = audience === "group" ? "Booking type: Group" : "Booking type: Private";
  return [prefix, specialRequests.trim()].filter(Boolean).join("\n\n");
}

function normalizeBookingAudience(value: string | null | undefined): BookingAudience | null {
  if (value === "group") return "group";
  if (value === "private" || value === "individual") return "private";
  return null;
}

function smoothScrollTo(element: HTMLElement | null, block: ScrollLogicalPosition = "start") {
  if (typeof window === "undefined" || !element) return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block });
    });
  });
}

export default function StudioRental() {
  const { t, i18n } = useTranslation();
  const [location, setLocation] = useLocation();
  const isFullAvailabilityView = location === "/studio-rental/availability";
  const skipNextSelectionResetRef = useRef(false);
  const availabilityBoardRef = useRef<HTMLDivElement | null>(null);
  const availabilityTimesRef = useRef<HTMLDivElement | null>(null);
  const builderSectionRef = useRef<HTMLDivElement | null>(null);
  const durationSectionRef = useRef<HTMLDivElement | null>(null);
  const bookingInfoSectionRef = useRef<HTMLDivElement | null>(null);
  const checkoutSectionRef = useRef<HTMLDivElement | null>(null);
  const [calendarJumpOpen, setCalendarJumpOpen] = useState(false);
  const [fullCalendarJumpOpen, setFullCalendarJumpOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<ReservationSidebarTab>("booking");

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [bookingAudience, setBookingAudience] = useState<BookingAudience | null>(null);
  const [selectedStudio, setSelectedStudio] = useState<number | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialRequests: "",
  });

  const [localBookings, setLocalBookings] = useState<LocalBooking[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringCount, setRecurringCount] = useState<number>(4);
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [isFinalizing, setIsFinalizing] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (!USE_LOCAL_DEV) return;

    setLocalBookings(getLocalBookings());

    if (typeof window !== "undefined") {
      const savedCart = safeJsonParse<any[]>(localStorage.getItem(LOCAL_CART_KEY), []);
      const normalizedCart: CartItem[] = savedCart.map((item) => ({
        ...item,
        bookingAudience: normalizeBookingAudience(item?.bookingAudience) ?? "private",
      }));
      setCart(normalizedCart);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (skipNextSelectionResetRef.current) {
      skipNextSelectionResetRef.current = false;
      return;
    }

    setSelectedStartTime(null);
    setSelectedDurationMinutes(null);
  }, [selectedStudio, selectedDate]);

  useEffect(() => {
    setSelectedDurationMinutes(null);
  }, [selectedStartTime]);

  const studiosQuery = trpc.studios.list.useQuery(undefined, {
    enabled: !USE_LOCAL_DEV,
  });

  const studios: Studio[] | undefined = USE_LOCAL_DEV ? LOCAL_STUDIOS : (studiosQuery.data as any);

  const timeSlots5Query = trpc.timeSlots.getByStudio.useQuery(
    { studioId: 5 },
    { enabled: !USE_LOCAL_DEV }
  );
  const timeSlots6Query = trpc.timeSlots.getByStudio.useQuery(
    { studioId: 6 },
    { enabled: !USE_LOCAL_DEV }
  );
  const timeSlots7Query = trpc.timeSlots.getByStudio.useQuery(
    { studioId: 7 },
    { enabled: !USE_LOCAL_DEV }
  );

  const studioOptions: StudioOption[] = useMemo(() => {
    const base: StudioOption[] = (studios ?? [])
      .filter((studio) => [5, 6, 7].includes(studio.id))
      .map((studio) => ({
        id: studio.id,
        name: studio.name || `Studio ${studio.id}`,
        description: studio.description || "Professional studio space",
        hourlyRates: {
          private: SINGLE_RATE_PRIVATE_CENTS,
          group: SINGLE_RATE_GROUP_CENTS,
        },
        availabilityStudioIds: [studio.id],
        showInOverview: true,
      }))
      .sort((a, b) => a.id - b.id);

    const has6 = base.some((studio) => studio.id === 6);
    const has7 = base.some((studio) => studio.id === 7);

    if (has6 && has7) {
      base.push({
        id: COMBO_OPTION_ID,
        name: "Studio X",
        description: "Book Studio 6 and Studio 7 together for larger classes or events.",
        hourlyRates: {
          private: COMBO_RATE_PRIVATE_CENTS,
          group: COMBO_RATE_GROUP_CENTS,
        },
        availabilityStudioIds: [6, 7],
        showInOverview: false,
      });
    }

    return base;
  }, [studios]);

  const selectedOption = studioOptions.find((option) => option.id === selectedStudio) ?? null;
  const overviewOptions = studioOptions.filter((option) => option.showInOverview);
  const comboOption = studioOptions.find((option) => option.id === COMBO_OPTION_ID) ?? null;

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const maxBookingDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + MAX_ADVANCE_DAYS);
    return date;
  }, [today]);

  const selectedDateIso = (selectedDate ?? new Date()).toISOString();

  const bookings5Query = trpc.bookings.getByStudioAndDate.useQuery(
    { studioId: 5, date: selectedDateIso },
    { enabled: !USE_LOCAL_DEV && !!selectedDate }
  );
  const bookings6Query = trpc.bookings.getByStudioAndDate.useQuery(
    { studioId: 6, date: selectedDateIso },
    { enabled: !USE_LOCAL_DEV && !!selectedDate }
  );
  const bookings7Query = trpc.bookings.getByStudioAndDate.useQuery(
    { studioId: 7, date: selectedDateIso },
    { enabled: !USE_LOCAL_DEV && !!selectedDate }
  );

  const localeForCurrency =
    i18n.language === "fr" ? "fr-CA" : i18n.language === "es" ? "es-ES" : "en-CA";

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat(localeForCurrency, {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const formatDateLong = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);

  const formatDateShort = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);

  const formatDayNumber = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, { day: "numeric" }).format(date);

  const formatWeekday = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(date);

  const formatTimeForDisplay = (time: string, date = selectedDate) => {
    if (!date) return time;

    const minutes = timeToMinutes(time);
    const value = new Date(date);
    value.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

    return new Intl.DateTimeFormat(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
    }).format(value);
  };

  const formatDurationLabel = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return t("studioRental.duration.minutes", {
        count: mins,
        defaultValue: `${mins} min`,
      });
    }

    if (mins === 0) {
      return t("studioRental.duration.hours", {
        count: hours,
        defaultValue: `${hours} hour(s)`,
      });
    }

    return t("studioRental.duration.hoursMinutes", {
      hours,
      minutes: mins,
      defaultValue: `${hours}h ${mins}m`,
    });
  };

  const getAudienceLabel = (audience: BookingAudience) =>
    audience === "group"
      ? t("studioRental.labels.group", { defaultValue: "Groups" })
      : t("studioRental.labels.private", { defaultValue: "Private" });

  const getTimeSlotsForStudio = (studioId: number): any[] | undefined => {
    if (USE_LOCAL_DEV) return undefined;

    switch (studioId) {
      case 5:
        return timeSlots5Query.data as any[] | undefined;
      case 6:
        return timeSlots6Query.data as any[] | undefined;
      case 7:
        return timeSlots7Query.data as any[] | undefined;
      default:
        return undefined;
    }
  };

  const getSelectedDateBookingsForStudio = (studioId: number): any[] => {
    if (USE_LOCAL_DEV) return [];

    switch (studioId) {
      case 5:
        return ((bookings5Query.data ?? []) as any[]).filter(
          (booking) => booking.status === "pending" || booking.status === "confirmed"
        );
      case 6:
        return ((bookings6Query.data ?? []) as any[]).filter(
          (booking) => booking.status === "pending" || booking.status === "confirmed"
        );
      case 7:
        return ((bookings7Query.data ?? []) as any[]).filter(
          (booking) => booking.status === "pending" || booking.status === "confirmed"
        );
      default:
        return [];
    }
  };

  const isCalendarDateDisabled = (date: Date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value.getTime() < today.getTime() || value.getTime() > maxBookingDate.getTime();
  };

  const DayButtonWithMaxDateTooltip = useMemo(() => {
    const tooltipText = t("studioRental.messages.maxAdvanceTooltip", {
      days: MAX_ADVANCE_DAYS,
      defaultValue: `Bookings can only be made up to ${MAX_ADVANCE_DAYS} days in advance.`,
    });

    return function WrappedDayButton(props: any) {
      const date: Date | undefined = props?.day?.date;
      const isDisabled = !!props?.modifiers?.disabled;
      const isAfterMax = !!date && date.getTime() > maxBookingDate.getTime();

      if (isDisabled && isAfterMax) {
        return (
          <span title={tooltipText} className="block h-full w-full">
            <CalendarDayButton {...props} />
          </span>
        );
      }

      return <CalendarDayButton {...props} />;
    };
  }, [maxBookingDate, t]);

  const getAvailabilitySegmentsForStudioDate = (studioId: number, date: Date): Segment[] => {
    if (USE_LOCAL_DEV) {
      return [{ start: FALLBACK_OPEN_MIN, end: FALLBACK_CLOSE_MIN }];
    }

    const raw = getTimeSlotsForStudio(studioId);
    if (raw === undefined) {
      return [{ start: FALLBACK_OPEN_MIN, end: FALLBACK_CLOSE_MIN }];
    }

    return buildSegmentsFromTimeSlots(raw, date);
  };

  const getAvailabilitySegmentsForOptionDate = (option: StudioOption, date: Date): Segment[] => {
    const [firstStudioId, ...otherStudioIds] = option.availabilityStudioIds;
    if (!firstStudioId) return [];

    let segments = getAvailabilitySegmentsForStudioDate(firstStudioId, date);
    for (const studioId of otherStudioIds) {
      segments = intersectSegments(segments, getAvailabilitySegmentsForStudioDate(studioId, date));
    }
    return segments;
  };

  const getPersistedBookingsForStudioDate = (studioId: number, date: Date) => {
    const dateKey = dateKeyLocal(date);

    if (USE_LOCAL_DEV) {
      return localBookings.filter((booking) => {
        if (!(booking.status === "pending" || booking.status === "confirmed")) return false;
        if (booking.studioId !== studioId) return false;
        return dateKeyLocal(new Date(booking.bookingDate)) === dateKey;
      });
    }

    if (selectedDate && dateKey === dateKeyLocal(selectedDate)) {
      return getSelectedDateBookingsForStudio(studioId);
    }

    return [];
  };

  const getBookedIntervalsForOptionDate = (option: StudioOption, date: Date): Segment[] => {
    const dateKey = dateKeyLocal(date);

    const persisted = option.availabilityStudioIds.flatMap((studioId) =>
      getPersistedBookingsForStudioDate(studioId, date).map((booking: any) => ({
        start: timeToMinutes(booking.startTime),
        end: timeToMinutes(booking.endTime),
      }))
    );

    const fromCart = cart
      .filter((item) => item.dateKey === dateKey && sharesAnyStudio(item.studioIds, option.availabilityStudioIds))
      .map((item) => ({
        start: timeToMinutes(item.startTime),
        end: timeToMinutes(item.endTime),
      }));

    return mergeSegments([...persisted, ...fromCart]);
  };

  const isIntervalFree = (intervals: Segment[], start: number, end: number) => {
    return !intervals.some((item) => intervalsOverlap(start, end, item.start, item.end));
  };

  const hasAnyAvailabilityForOption = (option: StudioOption, date: Date) => {
    const segments = getAvailabilitySegmentsForOptionDate(option, date);
    if (segments.length === 0) return false;

    const booked = getBookedIntervalsForOptionDate(option, date);
    const now = new Date();
    const isToday = isSameDay(date, now);
    const minStart = isToday
      ? roundUpToStep(now.getHours() * 60 + now.getMinutes(), START_STEP_MINUTES)
      : -Infinity;

    for (const segment of segments) {
      let start = roundUpToStep(segment.start, START_STEP_MINUTES);
      for (; start <= segment.end - MIN_DURATION_MINUTES; start += START_STEP_MINUTES) {
        if (start < minStart) continue;
        if (isIntervalFree(booked, start, start + MIN_DURATION_MINUTES)) return true;
      }
    }

    return false;
  };

  const dailyBoardOptions = useMemo(() => {
    return comboOption ? [...overviewOptions, comboOption] : overviewOptions;
  }, [overviewOptions, comboOption]);

  const fullCalendarOptions = useMemo(() => {
    return comboOption ? [...overviewOptions, comboOption] : overviewOptions;
  }, [overviewOptions, comboOption]);

  useEffect(() => {
    if (!selectedDate || !selectedOption) return;
    if (hasAnyAvailabilityForOption(selectedOption, selectedDate)) return;

    setSelectedStudio(null);
    setSelectedStartTime(null);
    setSelectedDurationMinutes(null);
  }, [selectedDate, selectedOption, localBookings, cart, bookings5Query.data, bookings6Query.data, bookings7Query.data, timeSlots5Query.data, timeSlots6Query.data, timeSlots7Query.data]);

  const availabilitySegments: Segment[] = useMemo(() => {
    if (!selectedDate || !selectedOption) return [];
    return getAvailabilitySegmentsForOptionDate(selectedOption, selectedDate);
  }, [selectedDate, selectedOption, timeSlots5Query.data, timeSlots6Query.data, timeSlots7Query.data]);

  const bookedIntervals = useMemo(() => {
    if (!selectedDate || !selectedOption) return [];
    return getBookedIntervalsForOptionDate(selectedOption, selectedDate);
  }, [selectedDate, selectedOption, localBookings, cart, bookings5Query.data, bookings6Query.data, bookings7Query.data]);

  const startTimeOptions = useMemo(() => {
    if (!selectedDate || !selectedOption || availabilitySegments.length === 0) return [];

    const now = new Date();
    const isToday = isSameDay(selectedDate, now);
    const minStart = isToday
      ? roundUpToStep(now.getHours() * 60 + now.getMinutes(), START_STEP_MINUTES)
      : -Infinity;

    const out: string[] = [];

    for (const segment of availabilitySegments) {
      let start = roundUpToStep(segment.start, START_STEP_MINUTES);
      for (; start <= segment.end - MIN_DURATION_MINUTES; start += START_STEP_MINUTES) {
        if (start < minStart) continue;
        if (!isIntervalFree(bookedIntervals, start, start + MIN_DURATION_MINUTES)) continue;
        out.push(minutesToTime(start));
      }
    }

    return out;
  }, [availabilitySegments, bookedIntervals, selectedDate, selectedOption]);

  const endTimeOptions = useMemo(() => {
    if (!selectedStartTime || !selectedOption) return [];

    const startMin = timeToMinutes(selectedStartTime);
    const activeSegment = availabilitySegments.find(
      (segment) => startMin >= segment.start && startMin < segment.end
    );
    if (!activeSegment) return [];

    const nextBookingStart = bookedIntervals
      .filter((interval) => interval.start > startMin && interval.start < activeSegment.end)
      .map((interval) => interval.start)
      .sort((a, b) => a - b)[0];

    const maxEnd = Math.min(
      activeSegment.end,
      nextBookingStart ?? activeSegment.end,
      startMin + MAX_DURATION_MINUTES
    );

    const options: { durationMinutes: number; endTime: string }[] = [];

    for (let end = startMin + MIN_DURATION_MINUTES; end <= maxEnd; end += DURATION_STEP_MINUTES) {
      if (!isIntervalFree(bookedIntervals, startMin, end)) continue;
      options.push({ durationMinutes: end - startMin, endTime: minutesToTime(end) });
    }

    return options;
  }, [selectedStartTime, availabilitySegments, bookedIntervals, selectedOption]);

  const selectedEndTime = useMemo(() => {
    if (!selectedStartTime || !selectedDurationMinutes) return null;
    return minutesToTime(timeToMinutes(selectedStartTime) + selectedDurationMinutes);
  }, [selectedStartTime, selectedDurationMinutes]);

  const selectedRateCents = useMemo(() => {
    if (!selectedOption || !bookingAudience) return 0;
    return selectedOption.hourlyRates[bookingAudience];
  }, [selectedOption, bookingAudience]);

  const totalPriceCents = useMemo(() => {
    if (!selectedOption || !selectedDurationMinutes || !bookingAudience) return 0;
    return Math.round((selectedOption.hourlyRates[bookingAudience] * selectedDurationMinutes) / 60);
  }, [selectedOption, selectedDurationMinutes, bookingAudience]);

  const maxRecurringOccurrences = useMemo(() => {
    if (!selectedDate) return 1;

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);

    const max = new Date(maxBookingDate);
    max.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((max.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const occurrences = Math.floor(diffDays / 7) + 1;
    return Math.max(1, Math.min(9, occurrences));
  }, [selectedDate, maxBookingDate]);

  useEffect(() => {
    if (maxRecurringOccurrences < 2) {
      setRecurringEnabled(false);
      setRecurringCount(2);
      return;
    }

    if (recurringCount > maxRecurringOccurrences) setRecurringCount(maxRecurringOccurrences);
    if (recurringCount < 2) setRecurringCount(2);
  }, [maxRecurringOccurrences, recurringCount]);

  const recurrenceOptions = useMemo(() => {
    if (maxRecurringOccurrences < 2) return [];
    return Array.from({ length: maxRecurringOccurrences - 1 }, (_, index) => index + 2);
  }, [maxRecurringOccurrences]);

  const canBuildSlot =
    !!bookingAudience &&
    !!selectedOption &&
    !!selectedDate &&
    !!selectedStartTime &&
    !!selectedDurationMinutes &&
    !!selectedEndTime;

  const scrollBackToAvailability = () => {
    if (typeof window === "undefined") return;

    window.setTimeout(() => {
      smoothScrollTo(availabilityTimesRef.current ?? availabilityBoardRef.current, "start");
    }, 120);
  };

  const addSingleToCart = (): boolean => {
    if (
      !canBuildSlot ||
      !selectedOption ||
      !selectedDate ||
      !selectedStartTime ||
      !selectedEndTime ||
      !selectedDurationMinutes ||
      !bookingAudience
    ) {
      toast.error(
        t("studioRental.errors.missingSelection", {
          defaultValue: "Please complete your selection first.",
        })
      );
      return false;
    }

    const item: CartItem = {
      id: makeId(),
      optionId: selectedOption.id,
      optionName: selectedOption.name,
      studioIds: [...selectedOption.availabilityStudioIds],
      bookingAudience,
      dateKey: dateKeyLocal(selectedDate),
      dateIso: toNoonIso(selectedDate),
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      durationMinutes: selectedDurationMinutes,
      hourlyRateCents: selectedRateCents,
      totalPriceCents,
    };

    setCart((prev) => [...prev, item]);
    toast.success(
      t("studioRental.cart.added", {
        defaultValue: "Added to your reservation.",
      })
    );
    setSelectedStartTime(null);
    setSelectedDurationMinutes(null);
    return true;
  };

  const handleAddSingleSlot = () => {
    const added = addSingleToCart();
    if (!added) return;
    scrollBackToAvailability();
  };

  const addRecurringToCart = (): boolean => {
    if (
      !canBuildSlot ||
      !selectedOption ||
      !selectedDate ||
      !selectedStartTime ||
      !selectedEndTime ||
      !selectedDurationMinutes ||
      !bookingAudience
    ) {
      toast.error(
        t("studioRental.errors.missingSelection", {
          defaultValue: "Please complete your selection first.",
        })
      );
      return false;
    }

    if (!recurringEnabled || recurringCount < 2) {
      toast.error(
        t("studioRental.recurring.pickCount", {
          defaultValue: "Choose how many weeks to repeat.",
        })
      );
      return false;
    }

    const seriesId = makeId();
    const startMin = timeToMinutes(selectedStartTime);
    const endMin = timeToMinutes(selectedEndTime);
    const occurrences: CartItem[] = [];
    const unavailableDates: string[] = [];

    for (let index = 0; index < recurringCount; index++) {
      const occurrenceDate = addDays(selectedDate, index * 7);

      if (isCalendarDateDisabled(occurrenceDate)) {
        unavailableDates.push(occurrenceDate.toLocaleDateString(i18n.language));
        continue;
      }

      const syntheticOption: StudioOption = {
        ...selectedOption,
      };

      const segments = getAvailabilitySegmentsForOptionDate(syntheticOption, occurrenceDate);
      const booked = getBookedIntervalsForOptionDate(syntheticOption, occurrenceDate);
      const insideOpenHours = segments.some(
        (segment) => startMin >= segment.start && endMin <= segment.end
      );

      if (!insideOpenHours || !isIntervalFree(booked, startMin, endMin)) {
        unavailableDates.push(occurrenceDate.toLocaleDateString(i18n.language));
        continue;
      }

      occurrences.push({
        id: makeId(),
        seriesId,
        optionId: selectedOption.id,
        optionName: selectedOption.name,
        studioIds: [...selectedOption.availabilityStudioIds],
        bookingAudience,
        dateKey: dateKeyLocal(occurrenceDate),
        dateIso: toNoonIso(occurrenceDate),
        startTime: selectedStartTime,
        endTime: selectedEndTime,
        durationMinutes: selectedDurationMinutes,
        hourlyRateCents: selectedRateCents,
        totalPriceCents,
      });
    }

    if (unavailableDates.length > 0) {
      const preview = unavailableDates.slice(0, 3).join(", ");
      const more = unavailableDates.length > 3 ? ` (+${unavailableDates.length - 3})` : "";
      toast.error(
        t("studioRental.messages.recurringUnavailable", {
          dates: `${preview}${more}`,
          defaultValue: `Some dates are not available: ${preview}${more}`,
        })
      );
      return false;
    }

    setCart((prev) => [...prev, ...occurrences]);
    setExpandedSeries((prev) => ({ ...prev, [seriesId]: false }));
    toast.success(
      t("studioRental.recurring.added", {
        count: occurrences.length,
        defaultValue: `Added ${occurrences.length} weekly reservations.`,
      })
    );

    setSelectedStartTime(null);
    setSelectedDurationMinutes(null);
    return true;
  };

  const removeCartItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const removeSeries = (seriesId: string) => {
    setCart((prev) => prev.filter((item) => item.seriesId !== seriesId));
    setExpandedSeries((prev) => {
      const copy = { ...prev };
      delete copy[seriesId];
      return copy;
    });
  };

  const clearCart = () => {
    setCart([]);
    setExpandedSeries({});
    toast.message(
      t("studioRental.cart.cleared", {
        defaultValue: "Reservation cleared.",
      })
    );
  };

  const cartTotalCents = useMemo(
    () => cart.reduce((sum, item) => sum + item.totalPriceCents, 0),
    [cart]
  );

  const cartGroups = useMemo(() => {
    const series = new Map<string, CartItem[]>();
    const singles: CartItem[] = [];

    for (const item of cart) {
      if (item.seriesId) {
        const existing = series.get(item.seriesId);
        if (existing) existing.push(item);
        else series.set(item.seriesId, [item]);
      } else {
        singles.push(item);
      }
    }

    const groups: Array<
      | { type: "single"; key: string; items: CartItem[]; totalCents: number }
      | { type: "series"; key: string; items: CartItem[]; totalCents: number }
    > = [];

    series.forEach((items, seriesId) => {
      const sorted = items
        .slice()
        .sort((a, b) => (a.dateIso + a.startTime).localeCompare(b.dateIso + b.startTime));

      groups.push({
        type: "series",
        key: seriesId,
        items: sorted,
        totalCents: sorted.reduce((sum, item) => sum + item.totalPriceCents, 0),
      });
    });

    for (const item of singles) {
      groups.push({
        type: "single",
        key: item.id,
        items: [item],
        totalCents: item.totalPriceCents,
      });
    }

    groups.sort((a, b) =>
      (a.items[0].dateIso + a.items[0].startTime).localeCompare(
        b.items[0].dateIso + b.items[0].startTime
      )
    );

    return groups;
  }, [cart]);

  const createBookingMutation = trpc.bookings.create.useMutation();

  const finalizeReservation = async () => {
    if (cart.length === 0) {
      toast.error(
        t("studioRental.errors.cartEmpty", {
          defaultValue: "Please add at least one time slot.",
        })
      );
      return;
    }

    if (!formData.name || !formData.email) {
      toast.error(
        t("studioRental.errors.requiredFields", {
          defaultValue: "Please fill in required fields.",
        })
      );
      return;
    }

    setIsFinalizing(true);

    try {
      if (USE_LOCAL_DEV) {
        for (let i = 0; i < cart.length; i++) {
          for (let j = i + 1; j < cart.length; j++) {
            const a = cart[i];
            const b = cart[j];

            if (a.dateKey !== b.dateKey) continue;
            if (!sharesAnyStudio(a.studioIds, b.studioIds)) continue;

            const aStart = timeToMinutes(a.startTime);
            const aEnd = timeToMinutes(a.endTime);
            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);

            if (intervalsOverlap(aStart, aEnd, bStart, bEnd)) {
              throw new Error(
                t("studioRental.messages.cartConflict", {
                  defaultValue: "Your cart has conflicting slots.",
                })
              );
            }
          }
        }

        for (const item of cart) {
          const startMin = timeToMinutes(item.startTime);
          const endMin = timeToMinutes(item.endTime);

          for (const studioId of item.studioIds) {
            for (const booking of localBookings) {
              if (!(booking.status === "pending" || booking.status === "confirmed")) continue;
              if (booking.studioId !== studioId) continue;
              if (dateKeyLocal(new Date(booking.bookingDate)) !== item.dateKey) continue;

              const bookingStart = timeToMinutes(booking.startTime);
              const bookingEnd = timeToMinutes(booking.endTime);
              if (intervalsOverlap(startMin, endMin, bookingStart, bookingEnd)) {
                throw new Error(
                  t("studioRental.messages.recurringUnavailable", {
                    dates: new Date(item.dateIso).toLocaleDateString(i18n.language),
                    defaultValue: "Some selected dates are no longer available.",
                  })
                );
              }
            }
          }
        }

        const groupId = makeId();
        const created: LocalBooking[] = [];

        for (const item of cart) {
          for (const studioId of item.studioIds) {
            created.push(
              createLocalBooking({
                studioId,
                userName: formData.name,
                userEmail: formData.email,
                userPhone: formData.phone || undefined,
                bookingDate: item.dateIso,
                startTime: item.startTime,
                endTime: item.endTime,
                specialRequests: buildBookingTypeNote(item.bookingAudience, formData.specialRequests) || undefined,
                status: "confirmed",
                groupId,
              })
            );
          }
        }

        setLocalBookings((prev) => [...prev, ...created]);
        toast.success(
          t("studioRental.bookingForm.success", {
            defaultValue: "Reservation confirmed.",
          })
        );

        clearCart();
        setSelectedStartTime(null);
        setSelectedDurationMinutes(null);
        return;
      }

      for (const item of cart) {
        const perStudioPrice =
          item.studioIds.length > 0
            ? Math.round(item.totalPriceCents / item.studioIds.length)
            : item.totalPriceCents;

        for (const studioId of item.studioIds) {
          await createBookingMutation.mutateAsync({
            studioId,
            userName: formData.name,
            userEmail: formData.email,
            userPhone: formData.phone || undefined,
            bookingDate: item.dateIso,
            startTime: item.startTime,
            endTime: item.endTime,
            specialRequests: buildBookingTypeNote(item.bookingAudience, formData.specialRequests) || undefined,
            totalPrice: perStudioPrice,
          } as any);
        }
      }

      toast.success(
        t("studioRental.bookingForm.success", {
          defaultValue: "Reservation confirmed.",
        })
      );
      clearCart();
      setSelectedStartTime(null);
      setSelectedDurationMinutes(null);
      await utils.bookings.getByStudioAndDate.invalidate();
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("studioRental.bookingForm.error", {
            defaultValue: "Something went wrong.",
          })
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const studiosLoading = !USE_LOCAL_DEV && studiosQuery.isLoading;
  const overviewLoading =
    !USE_LOCAL_DEV &&
    (timeSlots5Query.isLoading || timeSlots6Query.isLoading || timeSlots7Query.isLoading);
  const selectedDateBookingsLoading =
    !USE_LOCAL_DEV &&
    !!selectedDate &&
    (bookings5Query.isLoading || bookings6Query.isLoading || bookings7Query.isLoading);
  const showTimeLoading = overviewLoading || selectedDateBookingsLoading;

const getStartTimeOptionsForOptionDate = (option: StudioOption, date: Date) => {
  const segments = getAvailabilitySegmentsForOptionDate(option, date);
  if (segments.length === 0) return [] as string[];

  const booked = getBookedIntervalsForOptionDate(option, date);
  const now = new Date();
  const isToday = isSameDay(date, now);
  const minStart = isToday
    ? roundUpToStep(now.getHours() * 60 + now.getMinutes(), START_STEP_MINUTES)
    : -Infinity;

  const out: string[] = [];

  for (const segment of segments) {
    let start = roundUpToStep(segment.start, START_STEP_MINUTES);
    for (; start <= segment.end - MIN_DURATION_MINUTES; start += START_STEP_MINUTES) {
      if (start < minStart) continue;
      if (!isIntervalFree(booked, start, start + MIN_DURATION_MINUTES)) continue;
      out.push(minutesToTime(start));
    }
  }

  return out;
};

const applySlotSelection = (date: Date, studioId: number, time: string) => {
  skipNextSelectionResetRef.current = true;
  setSelectedDate(new Date(date));
  setSelectedStudio(studioId);
  setSelectedStartTime(time);
  setSelectedDurationMinutes(null);
};

const buildBookingHref = (date: Date, studioId: number, time: string) => {
  const params = new URLSearchParams({
    date: dateKeyLocal(date),
    studio: String(studioId),
    time,
  });

  if (bookingAudience) {
    params.set("audience", bookingAudience);
  }

  return `/studio-rental?${params.toString()}`;
};

useEffect(() => {
  if (typeof window === "undefined" || isFullAvailabilityView) return;

  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get("date");
  const timeParam = params.get("time");
  const studioParam = params.get("studio");
  const audienceParam = params.get("audience");

  const normalizedAudience = normalizeBookingAudience(audienceParam);
  if (normalizedAudience) {
    setBookingAudience(normalizedAudience);
  }

  if (!dateParam) return;

  const [year, month, day] = dateParam.split("-").map(Number);
  if (!year || !month || !day) return;

  const nextDate = new Date(year, month - 1, day);
  nextDate.setHours(0, 0, 0, 0);
  if (isCalendarDateDisabled(nextDate)) return;

  if (studioParam && timeParam) {
    const studioId = Number(studioParam);
    if (!Number.isNaN(studioId)) {
      applySlotSelection(nextDate, studioId, timeParam);
      return;
    }
  }

  setSelectedDate(nextDate);
}, [location, isFullAvailabilityView]);

useEffect(() => {
  if (typeof window === "undefined" || isFullAvailabilityView || !selectedStartTime) return;

  const timer = window.setTimeout(() => {
    smoothScrollTo(durationSectionRef.current ?? builderSectionRef.current, "start");
  }, 80);

  return () => window.clearTimeout(timer);
}, [selectedStartTime, isFullAvailabilityView]);

const selectedDateSlotPanels = useMemo(() => {
  const activeDate = selectedDate ?? today;

  return dailyBoardOptions.map((option) => ({
    option,
    times: getStartTimeOptionsForOptionDate(option, activeDate),
  }));
}, [dailyBoardOptions, selectedDate, today, localBookings, cart, timeSlots5Query.data, timeSlots6Query.data, timeSlots7Query.data, bookings5Query.data, bookings6Query.data, bookings7Query.data]);

const selectedDateAvailableOptionCount = selectedDateSlotPanels.filter(
  (panel) => panel.times.length > 0
).length;

const activeNavigationDate = selectedDate ?? today;
const canGoToPreviousDay = !isCalendarDateDisabled(addDays(activeNavigationDate, -1));
const canGoToNextDay = !isCalendarDateDisabled(addDays(activeNavigationDate, 1));

const changeSelectedDay = (direction: -1 | 1) => {
  const nextDate = addDays(activeNavigationDate, direction);
  if (isCalendarDateDisabled(nextDate)) return;
  setSelectedDate(nextDate);
};

const selectedSlotSummary = useMemo(() => {
  if (!selectedDate || !selectedOption || !selectedStartTime) return null;

  return {
    date: formatDateLong(selectedDate),
    studio: selectedOption.name,
    time: formatTimeForDisplay(selectedStartTime),
  };
}, [selectedDate, selectedOption, selectedStartTime, i18n.language]);

useEffect(() => {
  if (!selectedDate || !selectedOption || !selectedStartTime) return;

  const nextAvailableStarts = getStartTimeOptionsForOptionDate(selectedOption, selectedDate);
  if (!nextAvailableStarts.includes(selectedStartTime)) {
    setSelectedStartTime(null);
  }
}, [selectedDate, selectedOption, selectedStartTime, localBookings, cart, timeSlots5Query.data, timeSlots6Query.data, timeSlots7Query.data, bookings5Query.data, bookings6Query.data, bookings7Query.data]);

const fullAvailabilityDayPanels = useMemo(() => {
  const activeDate = selectedDate ?? today;

  return fullCalendarOptions.map((option) => ({
    option,
    times: getStartTimeOptionsForOptionDate(option, activeDate),
  }));
}, [fullCalendarOptions, selectedDate, today, localBookings, cart, timeSlots5Query.data, timeSlots6Query.data, timeSlots7Query.data, bookings5Query.data, bookings6Query.data, bookings7Query.data]);

const fullAvailabilityOpenOptionCount = fullAvailabilityDayPanels.filter(
  (panel) => panel.times.length > 0
).length;
const fullAvailabilityStartCount = fullAvailabilityDayPanels.reduce(
  (sum, panel) => sum + panel.times.length,
  0
);
const activeFullAvailabilityDate = selectedDate ?? today;
const isBookingInformationComplete =
  formData.name.trim().length > 0 && formData.email.trim().length > 0;
const canFinishReservation = canBuildSlot || cart.length > 0;
const selectedPrivateRateLabel = formatCurrency(
  selectedOption?.hourlyRates.private ?? SINGLE_RATE_PRIVATE_CENTS
);
const selectedGroupRateLabel = formatCurrency(
  selectedOption?.hourlyRates.group ?? SINGLE_RATE_GROUP_CENTS
);

const scrollToSidebarTab = (tab: ReservationSidebarTab) => {
  setActiveSidebarTab(tab);

  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    smoothScrollTo(
      tab === "booking" ? bookingInfoSectionRef.current : checkoutSectionRef.current,
      "start"
    );
  }, 90);
};

const handleContinueToCheckout = () => {
  if (cart.length === 0) {
    toast.error(
      t("studioRental.errors.cartEmpty", {
        defaultValue: "Add at least one time slot to continue.",
      })
    );
    return;
  }

  if (!isBookingInformationComplete) {
    toast.error(
      t("studioRental.errors.requiredFields", {
        defaultValue: "Please fill in required fields.",
      })
    );
    scrollToSidebarTab("booking");
    return;
  }

  scrollToSidebarTab("checkout");
};

const handleFinishReservation = () => {
  let addedToCart = true;

  if (canBuildSlot) {
    addedToCart = recurringEnabled && recurringCount >= 2 ? addRecurringToCart() : addSingleToCart();
  } else if (cart.length === 0) {
    toast.error(
      t("studioRental.errors.cartEmpty", {
        defaultValue: "Add at least one time slot to continue.",
      })
    );
    return;
  }

  if (!addedToCart) return;

  scrollToSidebarTab(isBookingInformationComplete ? "checkout" : "booking");
};

  const studioPageTheme: CSSProperties = {
    "--primary": "#0A5F58",
    "--primary-foreground": "#F8FCFB",
    "--background": "#FCFBF8",
    "--foreground": "#1C302D",
    "--card": "#FFFFFF",
    "--card-foreground": "#1C302D",
    "--popover": "#FFFFFF",
    "--popover-foreground": "#1C302D",
    "--secondary": "#F1F7F6",
    "--secondary-foreground": "#1C302D",
    "--muted": "#F4F7F6",
    "--muted-foreground": "#60716F",
    "--accent": "#EDF6F5",
    "--accent-foreground": "#1C302D",
    "--border": "#D7E5E2",
    "--input": "#D7E5E2",
    "--ring": "#0A5F58",
    "--sidebar": "#FCFBF8",
    "--sidebar-foreground": "#1C302D",
    "--sidebar-primary": "#0A5F58",
    "--sidebar-primary-foreground": "#F8FCFB",
    "--sidebar-accent": "#EDF6F5",
    "--sidebar-accent-foreground": "#1C302D",
    "--sidebar-border": "#D7E5E2",
    "--sidebar-ring": "#0A5F58",
  } as CSSProperties;

  const studioHeroGradientStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(10, 95, 88, 0.16) 0%, rgba(10, 95, 88, 0.10) 22%, rgba(10, 95, 88, 0.04) 46%, #FCFBF8 100%)",
  };

  const studioCalendarGradientStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(10, 95, 88, 0.12) 0%, rgba(10, 95, 88, 0.06) 20%, rgba(10, 95, 88, 0.02) 40%, #FCFBF8 100%)",
  };

  const fullCalendarDesktopGridStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `190px repeat(${fullCalendarOptions.length}, minmax(0, 1fr))`,
      }) as CSSProperties,
    [fullCalendarOptions.length]
  );

  if (isFullAvailabilityView) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground" style={studioPageTheme}>
        <Navbar />

        <main className="flex-1" style={studioCalendarGradientStyle}>
          <section className="py-8 md:py-10">
            <div className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-8 space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <Button asChild variant="outline" className="self-start bg-background/80 backdrop-blur-sm">
                  <Link href="/studio-rental">
                    {t("studioRental.fullCalendar.back", { defaultValue: "Back to studio rental" })}
                  </Link>
                </Button>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => changeSelectedDay(-1)}
                    disabled={!canGoToPreviousDay}
                    aria-label={t("studioRental.actions.previousDay", { defaultValue: "Previous day" })}
                    className="bg-background/80 backdrop-blur-sm"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-[220px] rounded-lg border border-border bg-background/85 px-4 py-2 text-center text-sm font-medium text-foreground backdrop-blur-sm">
                    {formatDateLong(activeFullAvailabilityDate)}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => changeSelectedDay(1)}
                    disabled={!canGoToNextDay}
                    aria-label={t("studioRental.actions.nextDay", { defaultValue: "Next day" })}
                    className="bg-background/80 backdrop-blur-sm"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <Popover open={fullCalendarJumpOpen} onOpenChange={setFullCalendarJumpOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="bg-background/80 backdrop-blur-sm">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {t("studioRental.actions.pickDate", { defaultValue: "Pick date" })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (!date) return;
                          setSelectedDate(date);
                          setFullCalendarJumpOpen(false);
                        }}
                        disabled={isCalendarDateDisabled}
                        className="rounded-xl border border-border bg-card p-3"
                        components={{ DayButton: DayButtonWithMaxDateTooltip }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {overviewLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-border/90 bg-card/90 p-5 shadow-sm backdrop-blur-sm md:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {isSameDay(activeFullAvailabilityDate, today)
                          ? t("studioRental.labels.today", { defaultValue: "Today" })
                          : t("studioRental.labels.selectedDate", { defaultValue: "Selected date" })}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
                        {formatDateLong(activeFullAvailabilityDate)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground">
                        {fullAvailabilityOpenOptionCount > 0
                          ? t("studioRental.fullCalendar.openStudiosCount", {
                              count: fullAvailabilityOpenOptionCount,
                              defaultValue: `${fullAvailabilityOpenOptionCount} booking option(s) open`,
                            })
                          : t("studioRental.fullCalendar.noOpenStudios", {
                              defaultValue: "No booking options open",
                            })}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground">
                        {fullAvailabilityStartCount > 0
                          ? t("studioRental.fullCalendar.totalStartsCount", {
                              count: fullAvailabilityStartCount,
                              defaultValue: `${fullAvailabilityStartCount} available start(s)`,
                            })
                          : t("studioRental.fullCalendar.noSlotsShort", {
                              defaultValue: "No times",
                            })}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                    {fullAvailabilityDayPanels.map((panel) => (
                      <div
                        key={`full-day-${panel.option.id}`}
                        className="rounded-2xl border border-border bg-background/82 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">{panel.option.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {panel.option.description}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                              panel.times.length > 0
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {panel.times.length > 0
                              ? t("studioRental.fullCalendar.openCount", {
                                  count: panel.times.length,
                                  defaultValue: `${panel.times.length} start(s)`,
                                })
                              : t("studioRental.fullCalendar.noSlotsShort", {
                                  defaultValue: "No times",
                                })}
                          </span>
                        </div>

                        <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-3">
                          {panel.times.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-3">
                              {panel.times.map((time) => (
                                <button
                                  key={`full-day-${panel.option.id}-${time}`}
                                  type="button"
                                  onClick={() => {
                                    if (typeof window !== "undefined") {
                                      window.location.href = buildBookingHref(
                                        activeFullAvailabilityDate,
                                        panel.option.id,
                                        time
                                      );
                                    } else {
                                      setLocation(
                                        buildBookingHref(activeFullAvailabilityDate, panel.option.id, time)
                                      );
                                    }
                                  }}
                                  className="rounded-lg border border-primary/15 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                                >
                                  {formatTimeForDisplay(time, activeFullAvailabilityDate)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
                              {t("studioRental.fullCalendar.noSlots", {
                                defaultValue: "No available start times",
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground" style={studioPageTheme}>
      <Navbar />

      <main className="flex-1">
        <section className="py-20" style={studioHeroGradientStyle}>
          <div className="container text-center">
            <img
              src="/logo-studio-horizontal.webp"
              alt="Alliance Studio"
              className="mx-auto mb-6 h-12 w-auto md:h-14"
            />
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-primary">
              {t("studioRental.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t("studioRental.subtitle")}
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container space-y-8">
            <div className="flex justify-start">
              <Button asChild variant="outline" className="bg-background/80 backdrop-blur-sm">
                <Link href="/studio-rental/availability">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {t("studioRental.actions.showFullAvailabilities", {
                    defaultValue: "Show full availabilities",
                  })}
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_400px] gap-8 items-start">
              <div className="space-y-6">
                <div ref={availabilityBoardRef}>
                  <Card className="border-border hover:border-primary transition-colors">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-2xl">
                      {t("studioRental.availability.todayCardTitle", { defaultValue: "Available start times" })}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t("studioRental.availability.todayCardSubtitle", {
                        defaultValue:
                          "This board always opens on today. Use the arrows or the date picker to switch days. Select any start time to continue.",
                      })}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-xl border border-border bg-secondary/35 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => changeSelectedDay(-1)}
                            disabled={!canGoToPreviousDay}
                            aria-label={t("studioRental.actions.previousDay", { defaultValue: "Previous day" })}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>

                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {selectedDate && isSameDay(selectedDate, today)
                                ? t("studioRental.labels.today", { defaultValue: "Today" })
                                : t("studioRental.labels.selectedDate", { defaultValue: "Selected date" })}
                            </div>
                            <div className="mt-1 text-lg font-semibold text-foreground">
                              {selectedDate ? formatDateLong(selectedDate) : formatDateLong(today)}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => changeSelectedDay(1)}
                            disabled={!canGoToNextDay}
                            aria-label={t("studioRental.actions.nextDay", { defaultValue: "Next day" })}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-sm text-foreground border border-border">
                            {selectedDateAvailableOptionCount > 0
                              ? t("studioRental.availability.optionsAvailableCount", {
                                  count: selectedDateAvailableOptionCount,
                                  defaultValue: `${selectedDateAvailableOptionCount} booking option(s) available`,
                                })
                              : t("studioRental.availability.noOptionsAvailable", {
                                  defaultValue: "No booking options available",
                                })}
                          </span>

                          <Popover open={calendarJumpOpen} onOpenChange={setCalendarJumpOpen}>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline">
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {t("studioRental.actions.pickDate", { defaultValue: "Pick date" })}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => {
                                  if (!date) return;
                                  setSelectedDate(date);
                                  setCalendarJumpOpen(false);
                                }}
                                disabled={isCalendarDateDisabled}
                                className="rounded-xl border border-border bg-card p-3"
                                components={{ DayButton: DayButtonWithMaxDateTooltip }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    <div ref={availabilityTimesRef}>
                    {showTimeLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className={cn("grid grid-cols-1 gap-4", selectedDateSlotPanels.length > 3 ? "lg:grid-cols-2 2xl:grid-cols-4" : "lg:grid-cols-3")}>
                        {selectedDateSlotPanels.map((panel) => {
                          const selectedStudioMatches = selectedStudio === panel.option.id;

                          return (
                            <div
                              key={`daily-panel-${panel.option.id}`}
                              className={cn(
                                "rounded-xl border p-4 transition-colors",
                                selectedStudioMatches
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-lg font-semibold text-foreground">{panel.option.name}</h3>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {panel.option.description}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                                    panel.times.length > 0
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {panel.times.length > 0
                                    ? t("studioRental.availability.startCount", {
                                        count: panel.times.length,
                                        defaultValue: `${panel.times.length} start(s)`,
                                      })
                                    : t("studioRental.availability.booked", {
                                        defaultValue: "Booked",
                                      })}
                                </span>
                              </div>

                              <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
                                {panel.times.length > 0 ? (
                                  <ScrollArea className="h-56 pr-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      {panel.times.map((time) => {
                                        const selected =
                                          selectedStudio === panel.option.id &&
                                          selectedStartTime === time &&
                                          !!selectedDate;

                                        return (
                                          <button
                                            key={`${panel.option.id}-${time}`}
                                            type="button"
                                            onClick={() =>
                                              selectedDate && applySlotSelection(selectedDate, panel.option.id, time)
                                            }
                                            className={cn(
                                              "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                                              selected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border bg-background hover:border-primary/50 hover:text-primary"
                                            )}
                                          >
                                            {formatTimeForDisplay(time, selectedDate ?? today)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </ScrollArea>
                                ) : (
                                  <div className="flex min-h-28 items-center justify-center text-center text-sm text-muted-foreground">
                                    {t("studioRental.availability.noTimesDay", {
                                      defaultValue: "No available start times for this studio on the selected day.",
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </CardContent>
                  </Card>
                </div>

                <div ref={builderSectionRef}>
                  <Card className="border-border hover:border-primary transition-colors">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-2xl">
                        {t("studioRental.audience.title", { defaultValue: "Rental type" })}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("studioRental.audience.subtitle", {
                          defaultValue:
                            "Choose the booking type, set the end time, and decide how you want to continue.",
                        })}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-3 rounded-xl border border-border bg-secondary/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {t("studioRental.labels.date", { defaultValue: "Date" })}
                          </div>
                          <div className="mt-2 text-sm font-medium text-foreground">
                            {selectedDate ? formatDateShort(selectedDate) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {t("studioRental.selectStudio", { defaultValue: "Studio" })}
                          </div>
                          <div className="mt-2 text-sm font-medium text-foreground">
                            {selectedOption?.name || "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {t("studioRental.labels.startTime", { defaultValue: "Start time" })}
                          </div>
                          <div className="mt-2 text-sm font-medium text-foreground">
                            {selectedStartTime ? formatTimeForDisplay(selectedStartTime) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {t("studioRental.labels.endTime", { defaultValue: "End time" })}
                          </div>
                          <div className="mt-2 text-sm font-medium text-foreground">
                            {selectedEndTime ? formatTimeForDisplay(selectedEndTime) : "—"}
                          </div>
                        </div>
                      </div>

                      {!selectedSlotSummary ? (
                        <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
                          {t("studioRental.messages.selectSlotFirst", {
                            defaultValue:
                              "Select a start time from the availability board above to continue building the reservation.",
                          })}
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div ref={durationSectionRef} className="rounded-xl border border-border bg-card p-4 md:p-5">
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <h3 className="text-base font-semibold text-foreground">
                                  {t("studioRental.labels.endTime", { defaultValue: "End time" })}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {t("studioRental.messages.minDurationNote", {
                                    defaultValue:
                                      "Minimum booking is 1 hour. After that, add 30-minute increments as needed.",
                                  })}
                                </p>
                              </div>

                              {endTimeOptions.length === 0 ? (
                                <div className="rounded-lg border border-border p-4 text-center">
                                  <p className="text-muted-foreground">
                                    {t("studioRental.messages.noDurations", {
                                      defaultValue: "No durations are available for this start time.",
                                    })}
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                  {endTimeOptions.map((option) => {
                                    const selected = selectedDurationMinutes === option.durationMinutes;
                                    return (
                                      <button
                                        key={option.endTime}
                                        type="button"
                                        onClick={() => setSelectedDurationMinutes(option.durationMinutes)}
                                        className={cn(
                                          "rounded-lg border p-3 text-left transition-all",
                                          selected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border bg-card hover:border-primary/50"
                                        )}
                                      >
                                        <div className="font-medium leading-none">
                                          {formatTimeForDisplay(option.endTime)}
                                        </div>
                                        <div
                                          className={cn(
                                            "mt-1 text-xs",
                                            selected
                                              ? "text-primary-foreground/80"
                                              : "text-muted-foreground"
                                          )}
                                        >
                                          {formatDurationLabel(option.durationMinutes)}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                              <div>
                                <h3 className="text-base font-semibold text-foreground">
                                  {t("studioRental.audience.title", { defaultValue: "Rental type" })}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {t("studioRental.audience.selectorSubtitle", {
                                    defaultValue:
                                      "Select private or groups so the correct price is applied to this reservation.",
                                  })}
                                </p>
                              </div>
                              {bookingAudience && (
                                <span className="inline-flex self-start rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-sm font-medium text-primary">
                                  {getAudienceLabel(bookingAudience)}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {[
                                {
                                  value: "private" as BookingAudience,
                                  title: t("studioRental.labels.private", { defaultValue: "Private" }),
                                  description: t("studioRental.audience.privateDesc", {
                                    defaultValue: "Private practice, one-on-one coaching, auditions, and personal rehearsals.",
                                  }),
                                  price: selectedPrivateRateLabel,
                                  icon: <User className="h-4 w-4" />,
                                },
                                {
                                  value: "group" as BookingAudience,
                                  title: t("studioRental.labels.group", { defaultValue: "Groups" }),
                                  description: t("studioRental.audience.groupDesc", {
                                    defaultValue: "Classes, workshops, rehearsals, and group sessions with higher occupancy.",
                                  }),
                                  price: selectedGroupRateLabel,
                                  icon: <Users className="h-4 w-4" />,
                                },
                              ].map((audience) => {
                                const active = bookingAudience === audience.value;
                                return (
                                  <button
                                    key={audience.value}
                                    type="button"
                                    onClick={() => setBookingAudience(audience.value)}
                                    className={cn(
                                      "rounded-xl border p-5 text-left transition-all",
                                      active
                                        ? "border-primary bg-primary/5"
                                        : "border-border bg-card hover:border-primary/50"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                                          {audience.icon}
                                          <span>{audience.title}</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">{audience.title}</h3>
                                        <p className="text-sm text-muted-foreground">{audience.description}</p>
                                      </div>
                                      {active && <Check className="mt-1 h-5 w-5 text-primary" />}
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                      <span className="text-sm text-muted-foreground">
                                        {t("studioRental.price.from", { defaultValue: "From" })}
                                      </span>
                                      <span className="text-lg font-semibold text-primary">
                                        {audience.price}/{t("studioRental.price.perHour", { defaultValue: "hour" })}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {selectedOption && selectedStartTime && selectedEndTime && selectedDurationMinutes ? (
                            bookingAudience ? (
                              <div className="rounded-xl border border-border bg-primary/10 p-4 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-foreground">
                                    {t("studioRental.price.total", { defaultValue: "Total" })}:
                                  </span>
                                  <span className="text-2xl font-semibold text-primary">
                                    {formatCurrency(totalPriceCents)}
                                  </span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {formatTimeForDisplay(selectedStartTime)} – {formatTimeForDisplay(selectedEndTime)} · {formatDurationLabel(selectedDurationMinutes)} · {formatCurrency(selectedRateCents)}/{t("studioRental.price.perHour", { defaultValue: "hour" })}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                                {t("studioRental.messages.selectAudienceFirst", {
                                  defaultValue:
                                    "Choose whether this booking is private or for a group so the correct rate can be applied.",
                                })}
                              </div>
                            )
                          ) : null}

                          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
                            <div>
                              <p className="font-medium text-foreground">
                                {t("studioRental.messages.addMultipleTitle", {
                                  defaultValue: "Build one clean reservation",
                                })}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {t("studioRental.messages.addMultipleNote", {
                                  defaultValue:
                                    "Add multiple slots, switch to another date above for multi-day reservations, or repeat the same weekly slot in one click.",
                                })}
                              </p>
                            </div>

                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <input
                                  type="checkbox"
                                  checked={recurringEnabled}
                                  onChange={(event) => setRecurringEnabled(event.target.checked)}
                                  disabled={maxRecurringOccurrences < 2}
                                  className="h-4 w-4 accent-[color:var(--primary)]"
                                />
                                <span className={cn(maxRecurringOccurrences < 2 && "text-muted-foreground")}>
                                  {t("studioRental.recurring.title", {
                                    defaultValue: "Recurring weekly",
                                  })}
                                </span>
                              </label>

                              {recurringEnabled && recurrenceOptions.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {recurrenceOptions.map((count) => (
                                    <button
                                      key={count}
                                      type="button"
                                      onClick={() => setRecurringCount(count)}
                                      className={cn(
                                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                        recurringCount === count
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-border bg-background hover:border-primary/50"
                                      )}
                                    >
                                      {count}×
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {recurringEnabled && recurrenceOptions.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {t("studioRental.recurring.helper", {
                                  count: recurringCount,
                                  defaultValue: `Adds ${recurringCount} weekly reservations (up to 2 months).`,
                                })}
                              </p>
                            )}

                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                              <Button type="button" variant="secondary" onClick={handleAddSingleSlot} disabled={!canBuildSlot}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t("studioRental.actions.addToCart", { defaultValue: "Add slot" })}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={addRecurringToCart}
                                disabled={!canBuildSlot || !recurringEnabled || recurringCount < 2}
                              >
                                <Repeat className="mr-2 h-4 w-4" />
                                {t("studioRental.actions.addRecurring", {
                                  defaultValue: "Add recurring series",
                                })}
                              </Button>

                              <Button type="button" onClick={handleFinishReservation} disabled={!canFinishReservation}>
                                {t("studioRental.actions.finishReservation", {
                                  defaultValue: "Finish reservation",
                                })}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24">
                <div className="rounded-xl border border-border bg-card p-1 shadow-sm">
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      {
                        value: "booking" as ReservationSidebarTab,
                        label: t("studioRental.sidebar.bookingInfo", {
                          defaultValue: "Booking information",
                        }),
                      },
                      {
                        value: "checkout" as ReservationSidebarTab,
                        label: t("studioRental.sidebar.checkout", {
                          defaultValue: "Checkout",
                        }),
                      },
                    ]).map((tab) => {
                      const active = activeSidebarTab === tab.value;
                      return (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => setActiveSidebarTab(tab.value)}
                          className={cn(
                            "rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeSidebarTab === "booking" ? (
                  <div ref={bookingInfoSectionRef}>
                    <Card className="border-border hover:border-primary transition-colors">
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-2xl">
                          {t("studioRental.bookingForm.title", { defaultValue: "Booking information" })}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {t("studioRental.bookingForm.subtitle", {
                            defaultValue: "Enter the client details once, then move to checkout.",
                          })}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="rental-name">{t("studioRental.bookingForm.name")} *</Label>
                          <Input
                            id="rental-name"
                            value={formData.name}
                            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="rental-email">{t("studioRental.bookingForm.email")} *</Label>
                          <Input
                            id="rental-email"
                            type="email"
                            value={formData.email}
                            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="rental-phone">{t("studioRental.bookingForm.phone")}</Label>
                          <Input
                            id="rental-phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                          />
                        </div>

                        <div>
                          <Label htmlFor="rental-requests">
                            {t("studioRental.bookingForm.specialRequests")}
                          </Label>
                          <Textarea
                            id="rental-requests"
                            value={formData.specialRequests}
                            onChange={(event) =>
                              setFormData({ ...formData, specialRequests: event.target.value })
                            }
                            rows={4}
                          />
                        </div>

                        <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                          {cart.length > 0
                            ? t("studioRental.bookingForm.summary", {
                                count: cart.length,
                                defaultValue: `${cart.length} slot(s) ready for checkout · ${formatCurrency(cartTotalCents)}`,
                              })
                            : t("studioRental.errors.cartEmpty", {
                                defaultValue: "Add at least one time slot to continue.",
                              })}
                        </div>

                        <Button type="button" className="w-full" onClick={handleContinueToCheckout} disabled={!isBookingInformationComplete || cart.length === 0}>
                          {t("studioRental.bookingForm.continueToCheckout", {
                            defaultValue: "Continue to checkout",
                          })}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>

                        {(!isBookingInformationComplete || cart.length === 0) && (
                          <p className="text-center text-xs text-muted-foreground">
                            {!isBookingInformationComplete
                              ? t("studioRental.errors.requiredFields", {
                                  defaultValue: "Please fill in required fields.",
                                })
                              : t("studioRental.errors.cartEmpty", {
                                  defaultValue: "Add at least one time slot to continue.",
                                })}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div ref={checkoutSectionRef}>
                    <Card className="border-border hover:border-primary transition-colors">
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-2xl">
                          {t("studioRental.sidebar.checkout", { defaultValue: "Checkout" })}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {cart.length === 0
                            ? t("studioRental.cart.empty", { defaultValue: "No slots added yet." })
                            : t("studioRental.cart.count", {
                                count: cart.length,
                                defaultValue: `${cart.length} slot(s) added`,
                              })}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {cart.length > 0 && (
                          <div className="flex items-center justify-end">
                            <Button type="button" size="sm" variant="ghost" onClick={clearCart}>
                              {t("studioRental.cart.clear", { defaultValue: "Clear" })}
                            </Button>
                          </div>
                        )}

                        {cart.length > 0 ? (
                          <ScrollArea className="h-[360px] pr-3">
                            <div className="space-y-3">
                              {cartGroups.map((group) => {
                                const first = group.items[0];
                                const isSeries = group.type === "series";
                                const expanded = isSeries ? !!expandedSeries[group.key] : false;

                                return (
                                  <div key={group.key} className="rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 space-y-1">
                                        <div className="font-medium text-foreground truncate">
                                          {isSeries
                                            ? `${t("studioRental.cart.seriesLabel", { defaultValue: "Weekly series" })} · ${first.optionName}`
                                            : first.optionName}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                          {formatDateShort(new Date(first.dateIso))} · {formatTimeForDisplay(first.startTime, new Date(first.dateIso))} – {formatTimeForDisplay(first.endTime, new Date(first.dateIso))}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {getAudienceLabel(first.bookingAudience)} · {formatDurationLabel(first.durationMinutes)}
                                        </div>
                                        {isSeries && (
                                          <div className="text-xs text-muted-foreground">
                                            {t("studioRental.cart.occurrences", {
                                              count: group.items.length,
                                              defaultValue: `${group.items.length} occurrences`,
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <div className="shrink-0 text-right">
                                        <div className="font-semibold text-primary">
                                          {formatCurrency(group.totalCents)}
                                        </div>
                                        <div className="mt-2 flex items-center justify-end gap-1">
                                          {isSeries && (
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              onClick={() =>
                                                setExpandedSeries((prev) => ({
                                                  ...prev,
                                                  [group.key]: !prev[group.key],
                                                }))
                                              }
                                            >
                                              {expanded ? (
                                                <ChevronUp className="h-4 w-4" />
                                              ) : (
                                                <ChevronDown className="h-4 w-4" />
                                              )}
                                            </Button>
                                          )}
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() =>
                                              isSeries ? removeSeries(group.key) : removeCartItem(first.id)
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>

                                    {isSeries && expanded && (
                                      <div className="mt-4 border-t border-border pt-4 space-y-2">
                                        {group.items.map((item) => (
                                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-muted-foreground">
                                              {formatDateShort(new Date(item.dateIso))}
                                            </span>
                                            <span className="text-foreground">
                                              {formatCurrency(item.totalPriceCents)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
                            {t("studioRental.cart.emptyHelper", {
                              defaultValue:
                                "Once you add a slot, it will stay here so the customer can review everything before submitting.",
                            })}
                          </div>
                        )}

                        <div className="rounded-lg border border-border bg-primary/10 p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              {t("studioRental.cart.total", { defaultValue: "Total" })}
                            </span>
                            <span className="text-2xl font-semibold text-primary">
                              {formatCurrency(cartTotalCents)}
                            </span>
                          </div>
                        </div>

                        {!isBookingInformationComplete && (
                          <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                            {t("studioRental.checkout.completeBookingInfo", {
                              defaultValue: "Complete the booking information before confirming the reservation.",
                            })}
                          </div>
                        )}

                        {!isBookingInformationComplete && (
                          <Button type="button" variant="outline" className="w-full" onClick={() => scrollToSidebarTab("booking")}>
                            {t("studioRental.checkout.backToBookingInfo", {
                              defaultValue: "Complete booking information",
                            })}
                          </Button>
                        )}

                        <Button
                          type="button"
                          className="w-full"
                          disabled={isFinalizing || cart.length === 0 || !isBookingInformationComplete}
                          onClick={() => {
                            void finalizeReservation();
                          }}
                        >
                          {isFinalizing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t("studioRental.bookingForm.submitting", {
                                defaultValue: "Submitting...",
                              })}
                            </>
                          ) : (
                            <>
                              {t("studioRental.bookingForm.submitCart", {
                                defaultValue: "Confirm reservation",
                              })}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
