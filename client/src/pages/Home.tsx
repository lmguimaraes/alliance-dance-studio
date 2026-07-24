import { Link } from "wouter";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  GraduationCap,
  Music2,
  Sparkles,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { BRAND_LOGOS } from "@/const";

const pillars = [
  {
    title: "Alliance",
    label: "Brand platform",
    description:
      "The main umbrella for the dance brand: culture, partnerships, events and the digital home at alliancedance.ca.",
    href: "/contact",
    cta: "Start a conversation",
    icon: Sparkles,
    colorClass: "bg-primary",
  },
  {
    title: "Dance Co.",
    label: "Creative company",
    description:
      "The artistic pillar for performance, creative direction, company work and the visual world behind Alliance.",
    href: "/about",
    cta: "Meet the company",
    icon: Users,
    colorClass: "bg-[#8A1027]",
  },
  {
    title: "Classes",
    label: "Training pillar",
    description:
      "Structured dance training for new dancers, social dancers and artists who want to keep growing with intention.",
    href: "/classes",
    cta: "View classes",
    icon: GraduationCap,
    colorClass: "bg-[#2563EB]",
  },
  {
    title: "Studio",
    label: "Space pillar",
    description:
      "A clean, practical studio environment for rehearsals, private sessions, rentals and community movement.",
    href: "/studio-rental",
    cta: "Book the studio",
    icon: Building2,
    colorClass: "bg-[#1F7A4D]",
  },
];

const highlights = [
  { value: "01", label: "Umbrella brand", detail: "One identity for the company, classes and studio." },
  { value: "02", label: "Clear pillars", detail: "Each area keeps its own color system and purpose." },
  { value: "03", label: "Modern experience", detail: "Minimal pages with strong hierarchy and useful calls to action." },
];

export default function Home() {
  return (
    <div className="brand-shell">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.18),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.05),_transparent_42%)]" />
          <div className="container relative grid gap-12 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="eyebrow">alliancedance.ca</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
                One dance brand. Multiple ways to move.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
                Alliance Dance brings the company, classes and studio together into a single modern brand for
                dancers, creators and community in Montreal.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/classes"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Explore classes
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/studio-rental"
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card/70 px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
                >
                  Studio rental
                </Link>
              </div>
            </div>

            <div className="glass-panel relative overflow-hidden rounded-[2rem] p-8">
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative mx-auto flex min-h-[420px] max-w-md flex-col items-center justify-center rounded-[1.5rem] border border-border/70 bg-background/40 p-8 text-center">
                <img
                  src={BRAND_LOGOS.alliance.vertical}
                  alt="Alliance Dance"
                  className="max-h-72 w-auto object-contain drop-shadow-sm"
                />
                <div className="mt-8 grid w-full grid-cols-3 gap-3 text-left">
                  <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                    <Music2 className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs font-medium text-muted-foreground">Culture</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs font-medium text-muted-foreground">Training</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                    <Building2 className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs font-medium text-muted-foreground">Space</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/40 py-12">
          <div className="container grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.value} className="rounded-3xl border border-border/70 bg-background/40 p-6">
                <p className="text-sm font-semibold text-primary">{item.value}</p>
                <h2 className="mt-3 text-lg font-semibold text-foreground">{item.label}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="max-w-2xl">
              <p className="eyebrow">Brand pillars</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Designed as a family, not a single page.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                The site now treats Alliance Dance as the parent brand, with each pillar keeping a distinct
                color identity while sharing the same clean structure.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;

                return (
                  <Card key={pillar.title} className="group overflow-hidden border-border bg-card/70 transition hover:-translate-y-1 hover:border-primary/50">
                    <CardContent className="flex h-full flex-col p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className={`h-3 w-10 rounded-full ${pillar.colorClass}`} />
                        <Icon className="h-5 w-5 text-primary" />
                      </div>

                      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {pillar.label}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold text-foreground">{pillar.title}</h3>
                      <p className="mt-4 flex-1 text-sm leading-6 text-muted-foreground">{pillar.description}</p>

                      <Link
                        href={pillar.href}
                        className="mt-8 inline-flex items-center text-sm font-semibold text-primary transition group-hover:gap-3"
                      >
                        {pillar.cta}
                        <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="rounded-[2rem] border border-border/70 bg-gradient-to-br from-card to-secondary/60 p-8 md:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="eyebrow">Next step</p>
                  <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                    Find the right part of Alliance for your project, training or rehearsal.
                  </h2>
                </div>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Contact Alliance
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
