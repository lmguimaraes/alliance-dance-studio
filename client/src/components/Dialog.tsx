import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  variant?: "modal" | "drawer";
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Accessible modal built on the native <dialog> element. */
export default function Dialog({
  open,
  onClose,
  title,
  subtitle,
  variant = "modal",
  className,
  children,
  footer,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add("has-modal");
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) document.documentElement.classList.remove("has-modal");
  }, [open]);

  useEffect(
    () => () => document.documentElement.classList.remove("has-modal"),
    []
  );

  return (
    <dialog
      ref={ref}
      className={cx(
        "dialog",
        variant === "drawer" && "dialog--drawer",
        className
      )}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <header className="dialog__header">
            <div>
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {subtitle && <p className="dialog__subtitle">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer}
        </>
      )}
    </dialog>
  );
}
