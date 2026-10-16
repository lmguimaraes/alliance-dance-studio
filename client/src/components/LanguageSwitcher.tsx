import { useTranslation } from "react-i18next";
import { currentLanguage, SUPPORTED_LANGUAGES } from "@/lib/format";

const NAMES = { en: "English", fr: "Français", es: "Español" } as const;

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const active = currentLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t("nav.language")}
    >
      {SUPPORTED_LANGUAGES.map(language => (
        <button
          key={language}
          type="button"
          lang={language}
          className="language-switcher__option"
          aria-pressed={active === language}
          aria-label={NAMES[language]}
          onClick={() => void i18n.changeLanguage(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
