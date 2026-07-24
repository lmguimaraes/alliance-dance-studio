import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function NotFound() {
  return (
    <div className="brand-shell">
      <Navbar />

      <main className="flex flex-1 items-center py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-border/70 bg-card/70 p-8 text-center md:p-12">
            <p className="eyebrow">404</p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">This page missed the count.</h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              The page you are looking for is not available. Head back to Alliance Dance or contact us for the
              right direction.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Go home
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background/50 px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
