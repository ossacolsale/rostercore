import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";

export function Modal({ title, label = title, children, onClose, actions, className = "", dismissible = true }: {
  title: string;
  label?: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    heading.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={label} onCancel={(event) => {
    event.preventDefault();
    if (dismissible) onClose();
  }}>
    <div className="dialog-header">
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      {!actions && <button className="quiet icon-button" aria-label={t("{title} - close", { title })} onClick={onClose}>×</button>}
    </div>
    <div className="dialog-content">{children}</div>
    {actions && <div className="dialog-actions">{actions}</div>}
  </dialog>;
}

export function ReviewDialog({
  title, children, onCancel, onConfirm, disabled = false, confirmLabel, destructive = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return <Modal title={title} onClose={onCancel} dismissible={!confirming} actions={<>
    <button disabled={confirming} onClick={onCancel}>{t("Cancel")}</button>
    <button className={destructive ? "danger-button" : "primary"} disabled={disabled || confirming} onClick={async () => {
      setConfirming(true);
      try { await onConfirm(); }
      finally { setConfirming(false); }
    }}>{confirming ? t("Working…") : confirmLabel ?? t("Confirm changes")}</button>
  </>}>{children}</Modal>;
}
