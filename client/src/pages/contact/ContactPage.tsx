import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Instagram, Mail, MapPin } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { BRAND } from "@/lib/brand";
import { usePageMeta } from "@/lib/usePageMeta";
import "./contact.css";

const TOPICS = ["general", "classes", "rental", "company", "events"] as const;

export default function ContactPage() {
  const { t } = useTranslation();
  usePageMeta(t("contact.title"), t("contact.intro"));
  const [form, setForm] = useState({
    name: "",
    email: "",
    topic: "general",
    message: "",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topic = t(`contact.topics.${form.topic}`);
    const subject = `${BRAND.name}: ${topic}`;
    const body = [form.message, "", `${form.name}`, form.email].join("\n");
    window.location.href = `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <PageHeader title={t("contact.title")} intro={t("contact.intro")} />
      <div className="container contact">
        <ul className="contact-details" role="list">
          <li>
            <a href={`mailto:${BRAND.email}`} className="contact-details__item">
              <Mail aria-hidden="true" />
              <span>{BRAND.email}</span>
            </a>
          </li>
          <li>
            <a
              href={BRAND.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="contact-details__item"
            >
              <Instagram aria-hidden="true" />
              <span>@{BRAND.instagramHandle}</span>
            </a>
          </li>
          <li className="contact-details__item">
            <MapPin aria-hidden="true" />
            <span>{BRAND.city}</span>
          </li>
        </ul>

        <form className="contact-form" onSubmit={submit}>
          <div className="contact-form__row">
            <label className="field">
              <span className="field__label">{t("contact.form.name")}</span>
              <input
                className="field__input"
                autoComplete="name"
                required
                value={form.name}
                onChange={event =>
                  setForm(current => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span className="field__label">{t("contact.form.email")}</span>
              <input
                className="field__input"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">{t("contact.form.topic")}</span>
            <select
              className="field__select"
              value={form.topic}
              onChange={event =>
                setForm(current => ({ ...current, topic: event.target.value }))
              }
            >
              {TOPICS.map(topic => (
                <option key={topic} value={topic}>
                  {t(`contact.topics.${topic}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t("contact.form.message")}</span>
            <textarea
              className="field__textarea"
              required
              rows={6}
              value={form.message}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  message: event.target.value,
                }))
              }
            />
          </label>
          <div className="button-row">
            <button type="submit" className="button button--primary">
              {t("contact.form.submit")}
            </button>
            <p className="field__hint">{t("contact.form.hint")}</p>
          </div>
        </form>
      </div>
    </>
  );
}
