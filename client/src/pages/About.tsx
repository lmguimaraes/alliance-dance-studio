import { Link } from "wouter";
import { ArrowRight, CircleDot, Palette, Sparkles, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { BRAND_LOGOS } from "@/const";

const values = [
  {
    title: "Creative direction",
    description:
      "A visual and movement language for performances, campaigns, events and projects that need a precise dance voice.",
    icon: Palette,
  },
  {
    title: "Company work",
    description:
      "A home for artists, rehearsals and dance concepts that carry the Alliance Dance Co. identity forward.",
    icon: Sparkles,
  },
  {
    title: "Community connection",
    description:
      "A bridge between stage, studio and class culture so the brand feels connected instead of fragmented.",
    icon: Users,
  },
];

const brandMap = [
  { name: "Alliance", role: "Parent brand", color: "Gold", className: "bg-[#D4AF37]" },
  { name: "Dance Co.", role: "Creative company", color: "Burgundy", className: "bg-[#8A1027]" },
  { name: "Classes", role: "Training pillar", color: "Blue", className: "bg-[#2563EB]" },
  { name: "Studio", role: "Space pillar", color: "Green", className: "bg-[#1F7A4D]" },
];

export default function About() {
  return (
    <div className="brand-shell">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-background via-background to-secondary/60">
          <div className="container grid gap-12 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="glass-panel relative overflow-hidden rounded-[2rem] p-8">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative rounded-[1.5rem] border border-border/70 bg-card p-8 text-center">
                <img
                  src={BRAND_LOGOS.danceCo.horizontal}
                  alt="Alliance Dance Co."
                  className="mx-auto max-h-44 w-auto object-contain"
                />
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Create</p>
                  </div>
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Perform</p>
                  </div>
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Connect</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow">Alliance Dance Co.</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
                The creative company inside Alliance Dance.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
                Alliance Dance Co. is the artistic pillar of the brand: a place for performance, direction,
                rehearsal culture and the creative identity that gives the wider Alliance ecosystem its edge.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/gallery"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  View gallery
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
                >
                  Collaborate
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="max-w-2xl">
              <p className="eyebrow">What it represents</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Burgundy, space and restraint.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                This page follows the same clean page rhythm as classes and rental, but the burgundy identity
                makes Dance Co. feel more editorial, artistic and company-led.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {values.map((value) => {
                const Icon = value.icon;

                return (
                  <Card key={value.title} className="border-border bg-card transition hover:-translate-y-1 hover:border-primary/50">
                    <CardContent className="p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-6 text-xl font-semibold text-foreground">{value.title}</h3>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{value.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="grid gap-8 rounded-[2rem] border border-border/70 bg-card p-8 md:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="eyebrow">Brand architecture</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                  One parent brand, four clear roles.
                </h2>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  The site can now communicate Alliance Dance as a complete dance ecosystem instead of only a
                  studio website.
                </p>
              </div>

              <div className="space-y-3">
                {brandMap.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-background/60 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full ${item.className}`} />
                      <div>
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <CircleDot className="h-4 w-4" />
                      {item.color}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
