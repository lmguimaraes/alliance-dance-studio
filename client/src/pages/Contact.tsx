import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Building2, GraduationCap, Mail, MapPin, MessageCircle, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { BRAND_LOGOS } from "@/const";

const contactPaths = [
  {
    title: "Classes",
    description: "Schedules, private lessons, training goals and group class questions.",
    href: "/classes",
    icon: GraduationCap,
  },
  {
    title: "Studio rental",
    description: "Rehearsals, availability, recurring bookings and special uses of the space.",
    href: "/studio-rental",
    icon: Building2,
  },
  {
    title: "Dance Co.",
    description: "Company work, collaborations, events, performances and creative direction.",
    href: "/about",
    icon: Sparkles,
  },
];

const inputClass =
  "mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    interest: "General inquiry",
    message: "",
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const subject = encodeURIComponent(`Alliance Dance inquiry - ${formData.interest}`);
    const body = encodeURIComponent(
      [
        `Name: ${formData.name}`,
        `Email: ${formData.email}`,
        `Interest: ${formData.interest}`,
        "",
        formData.message,
      ].join("\n")
    );

    window.location.href = `mailto:info@alliancedance.ca?subject=${subject}&body=${body}`;
  };

  return (
    <div className="brand-shell">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.16),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,0.04),_transparent_44%)]" />
          <div className="container relative grid gap-12 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="eyebrow">Contact Alliance Dance</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
                Tell us where you want to move next.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
                Reach out for classes, studio rentals, Dance Co. collaborations or broader Alliance brand
                conversations. We will route your inquiry to the right pillar.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <a
                  href="mailto:info@alliancedance.ca"
                  className="rounded-3xl border border-border bg-card/70 p-5 transition hover:border-primary"
                >
                  <Mail className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-semibold text-foreground">info@alliancedance.ca</p>
                  <p className="mt-1 text-xs text-muted-foreground">Primary email</p>
                </a>
                <div className="rounded-3xl border border-border bg-card/70 p-5">
                  <MapPin className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-semibold text-foreground">Montreal, QC</p>
                  <p className="mt-1 text-xs text-muted-foreground">Dance brand and studio community</p>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-[2rem] p-6 md:p-8">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/80 p-6 md:p-8">
                <img
                  src={BRAND_LOGOS.alliance.horizontal}
                  alt="Alliance Dance"
                  className="mb-8 h-16 w-auto object-contain"
                />

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-medium text-foreground">
                      Name
                      <input
                        className={inputClass}
                        name="name"
                        onChange={(event) => setFormData((data) => ({ ...data, name: event.target.value }))}
                        placeholder="Your name"
                        required
                        value={formData.name}
                      />
                    </label>
                    <label className="text-sm font-medium text-foreground">
                      Email
                      <input
                        className={inputClass}
                        name="email"
                        onChange={(event) => setFormData((data) => ({ ...data, email: event.target.value }))}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={formData.email}
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-medium text-foreground">
                    Interest
                    <select
                      className={inputClass}
                      name="interest"
                      onChange={(event) => setFormData((data) => ({ ...data, interest: event.target.value }))}
                      value={formData.interest}
                    >
                      <option>General inquiry</option>
                      <option>Classes</option>
                      <option>Studio rental</option>
                      <option>Dance Co.</option>
                      <option>Partnerships and events</option>
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-foreground">
                    Message
                    <textarea
                      className={`${inputClass} min-h-36 resize-none`}
                      name="message"
                      onChange={(event) => setFormData((data) => ({ ...data, message: event.target.value }))}
                      placeholder="Tell us about your class goal, rental date, collaboration idea or brand inquiry."
                      required
                      value={formData.message}
                    />
                  </label>

                  <Button className="w-full rounded-full" size="lg" type="submit">
                    Open email draft
                    <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="max-w-2xl">
              <p className="eyebrow">Choose a path</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                One contact point, three practical directions.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {contactPaths.map((path) => {
                const Icon = path.icon;

                return (
                  <Link
                    key={path.title}
                    href={path.href}
                    className="group rounded-[2rem] border border-border bg-card/70 p-6 transition hover:-translate-y-1 hover:border-primary/50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-foreground">{path.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{path.description}</p>
                    <span className="mt-6 inline-flex items-center text-sm font-semibold text-primary">
                      Learn more
                      <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="rounded-[2rem] border border-border/70 bg-card/60 p-8 md:p-12">
              <MessageCircle className="h-6 w-6 text-primary" />
              <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                Alliance is built to be easy to reach, whether you are training, renting space or building something creative.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
                Send one clear message and we will connect it to the right part of the brand.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
