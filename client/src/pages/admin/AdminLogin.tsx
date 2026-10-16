import { useState, type FormEvent } from "react";
import { TRPCClientError } from "@trpc/client";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { BRAND, PATHS } from "@/lib/brand";
import { trpc } from "@/lib/trpc";

export default function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = trpc.admin.login.useMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ password });
      onSuccess();
    } catch (cause) {
      const code =
        cause instanceof TRPCClientError ? cause.data?.code : undefined;
      setError(
        code === "TOO_MANY_REQUESTS"
          ? t("errors.tooMany")
          : t("admin.login.incorrect")
      );
      setPassword("");
    }
  }

  return (
    <div className="admin admin--centered">
      <form className="admin-login" onSubmit={submit}>
        <img src={BRAND.logos.large} alt={BRAND.name} width={121} height={60} />
        <h1 className="admin-login__title">{t("admin.login.title")}</h1>
        <label className="field">
          <span className="field__label">{t("admin.login.password")}</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            aria-invalid={error ? true : undefined}
            onChange={event => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button button--primary button--block"
          disabled={login.isPending}
        >
          {t("admin.login.submit")}
        </button>
        <Link href={PATHS.home} className="button button--quiet">
          {t("admin.viewSite")}
        </Link>
      </form>
    </div>
  );
}
