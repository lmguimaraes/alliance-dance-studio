import { Link } from "wouter";
import { ArrowRight, Camera, ImageIcon, Sparkles } from "lucide-react";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { BRAND_LOGOS } from "@/const";

const galleryItems = [
  {
    category: "Company",
    title: "Performance identity",
    description: "A visual space for stage work, concepts and company moments.",
  },
  {
    category: "Process",
    title: "Rehearsal culture",
    description: "Clean compositions for practice, preparation and the work behind the work.",
  },
  {
    category: "Community",
    title: "Dance connections",
    description: "Snapshots of people, movement and shared energy around the brand.",
  },
  {
    category: "Studio",
    title: "Space in motion",
    description: "A polished bridge between the company identity and the physical studio.",
  },
  {
    category: "Classes",
    title: "Learning rhythm",
    description: "Training, progression and the approachable side of Alliance Dance.",
  },
  {
    category: "Alliance",
    title: "Brand moments",
    description: "Visual storytelling for events, partnerships and future campaigns.",
  },
];

export default function Gallery() {
  return (
    <div className="brand-shell">
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-border/70 bg-gradient-to-br from-background via-background to-secondary/70 py-20 md:py-28">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow">Gallery</p>
              <h1 className="mt-5 text-5xl font-semibold tracking-tight md:text-7xl">
                A refined visual system for Alliance Dance Co.
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground md:text-xl">
                The gallery is built around the burgundy company identity so future photography can drop into a
                clean, editorial grid without changing the page structure.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {galleryItems.map((item, index) => (
                <article
                  key={item.title}
                  className={`group overflow-hidden rounded-[2rem] border border-border bg-card transition hover:-translate-y-1 hover:border-primary/50 ${
                    index === 0 ? "md:col-span-2" : ""
                  }`}
                >
                  <div className="relative min-h-[260px] overflow-hidden bg-gradient-to-br from-secondary via-background to-card p-6">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,_rgba(138,16,39,0.16),_transparent_36%)]" />
                    <div className="relative flex h-full min-h-[220px] flex-col justify-between rounded-[1.5rem] border border-border/70 bg-card/70 p-6">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                          {item.category}
                        </span>
                        <ImageIcon className="h-5 w-5 text-primary" />
                      </div>

                      <div className="flex justify-center py-6 opacity-80 transition group-hover:scale-105 group-hover:opacity-100">
                        <img
                          src={BRAND_LOGOS.danceCo.vertical}
                          alt="Alliance Dance Co. mark"
                          className="max-h-32 w-auto object-contain"
                        />
                      </div>

                      <div>
                        <h2 className="text-2xl font-semibold text-foreground">{item.title}</h2>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="rounded-[2rem] border border-border/70 bg-card p-8 md:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex items-center gap-3 text-primary">
                    <Camera className="h-5 w-5" />
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]">Photo direction</p>
                  </div>
                  <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                    A flexible grid for performances, rehearsals and brand shoots.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Portrait, landscape and detail images can live in the same cards while keeping the burgundy company treatment.
                  </p>
                </div>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Plan a project
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="grid gap-5 md:grid-cols-3">
              {["Editorial", "Minimal", "Movement-led"].map((word) => (
                <div key={word} className="rounded-3xl border border-border bg-card p-6">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <p className="mt-6 text-xl font-semibold text-foreground">{word}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    A clean visual direction that gives the company identity room to breathe.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
