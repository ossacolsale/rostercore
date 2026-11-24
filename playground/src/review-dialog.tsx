import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "./i18n";
export function ReviewDialog({
  title,
  children,
  onCancel,
  onConfirm,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="diagnostic-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      {children}
      <div className="row">
        <button onClick={onCancel}>{t("Cancel")}</button>
        <button className="primary" disabled={disabled} onClick={onConfirm}>
          {t("Confirm changes")}
        </button>
      </div>
    </dialog>
  );
}
