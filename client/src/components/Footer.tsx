import { Link, useLocation } from "wouter";
import { ArrowRight, Globe2, Mail, MapPin } from "lucide-react";

import { APP_TITLE, BRAND_LOGOS } from "@/const";

const getLogoForRoute = (location: string) => {
  if (location.startsWith("/about") || location.startsWith("/gallery")) {
    return BRAND_LOGOS.danceCo.horizontal;
  }

  return BRAND_LOGOS.alliance.horizontal;
};

export default function Footer() {
  const [location] = useLocation();
  const logo = getLogoForRoute(location);

  const pillars = [
    { href: "/about", label: "Dance Co.", description: "Creative work, performance and brand story" },
    { href: "/classes", label: "Classes", description: "Training, technique and social dance" },
    { href: "/studio-rental", label: "Studio", description: "Space for rehearsals, rentals and creation" },
  ];

  return (
    <footer className="border-t border-border/70 bg-card/40">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <img src={logo} alt={APP_TITLE} className="h-14 w-auto object-contain" />
            </Link>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Alliance Dance is a Montreal dance brand bringing together creative work, training, community
              and studio space under one clean identity.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Pillars</h3>
            <div className="mt-5 space-y-4">
              {pillars.map((pillar) => (
                <Link
                  key={pillar.href}
                  href={pillar.href}
                  className="group flex items-start justify-between gap-3 rounded-2xl border border-transparent p-3 transition hover:border-border hover:bg-background/40"
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{pillar.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{pillar.description}</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 text-primary opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Contact</h3>
            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <a className="flex items-center gap-3 hover:text-primary" href="mailto:info@alliancedance.ca">
                <Mail className="h-4 w-4" />
                info@alliancedance.ca
              </a>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                Montreal, QC, Canada
              </div>
              <a className="flex items-center gap-3 hover:text-primary" href="https://alliancedance.ca">
                <Globe2 className="h-4 w-4" />
                alliancedance.ca
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border/70 pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Alliance Dance. All rights reserved.</p>
          <p>Clean, modern dance identity for company, classes and studio.</p>
        </div>
      </div>
    </footer>
  );
}
