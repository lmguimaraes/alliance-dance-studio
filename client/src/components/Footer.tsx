import { useTranslation } from "react-i18next";
import { Instagram, Facebook, Mail, Phone, MapPin } from "lucide-react";
import { LOGOS } from "@/const";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-card border-t border-border">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo & Description */}
          <div>
            {/* Default site logo */}
            <img
              src={LOGOS.default}
              alt="Alliance"
              className="h-12 w-auto mb-4 brand-logo-default"
            />

            {/* Studio vertical logo (shown only inside .studio-theme) */}
            <img
              src={LOGOS.studio}
              alt="Alliance Studio"
              className="h-12 w-auto mb-4 brand-logo-studio"
            />

            {/* Academy logo (only inside .academy-theme) */}
            <img
              src={LOGOS.academy}
              alt="Alliance Academy"
              className="h-12 w-auto mb-4 brand-logo-academy"
            />

            <p className="text-sm text-muted-foreground">
              {t("home.overview.description")}
            </p>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-primary">
              {t("contact.title")}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                <span>Montreal, QC, Canada</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 text-primary" />
                <span>+1 (514) XXX-XXXX</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span>info@alliancedance.com</span>
              </div>
            </div>
          </div>

          {/* Social Media */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-primary">
              {t("home.instagram.title")}
            </h3>
            <div className="flex gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5 text-primary" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5 text-primary" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Alliance Dance Studio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}