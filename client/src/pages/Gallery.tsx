import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Gallery() {
  const { t } = useTranslation();

  // Placeholder images - replace with actual gallery images
  const galleryItems = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    src: `https://placehold.co/600x400/1a1a1a/d4af37?text=Dance+${i + 1}`,
    alt: `Dance photo ${i + 1}`,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-br from-background via-background to-secondary/5">
          <div className="container text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-primary">
              {t("gallery.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t("gallery.subtitle")}
            </p>
          </div>
        </section>

        {/* Gallery Grid */}
        <section className="py-20">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {galleryItems.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border hover:border-primary transition-all cursor-pointer"
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Instagram Section */}
        <section className="py-20 bg-card">
          <div className="container text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-primary">
              {t("home.instagram.title")}
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Follow us on Instagram for daily updates, dance tips, and community highlights
            </p>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              @alliancedancestudio
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
