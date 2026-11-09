import { useEffect, useRef, useState } from "react";
import type { ScheduleArchive } from "./archives";
import type { Run } from "./results";
import { useI18n } from "./i18n";
export function calendarToday(zone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
export function WorkCompletion({
  archive,
  run,
  onClose,
}: {
  archive: ScheduleArchive;
  run: Run;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const today = calendarToday(archive.scenario.calendar.timezone),
    last = today < archive.period.end ? today : archive.period.end;
  const [through, setThrough] = useState(last),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="calendar-context-dialog"
      aria-label={t("Record work performed")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>{t("Record work performed")}</h2>
      <p>
        {t(
          "Only confirm work that actually happened. Future planned work belongs in publication, not completed history.",
        )}
      </p>
      <label className="field">
        <span>{t("Actually worked through")}</span>
        <input
          type="date"
          min={archive.completedThrough ?? archive.period.start}
          max={last}
          value={through}
          onChange={(e) => {
            setThrough(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("I confirm these shifts were actually worked")}
      </label>
      <div className="dialog-actions">
        <button onClick={onClose}>{t("Cancel")}</button>
        <button
          className="primary"
          disabled={
            !confirmed ||
            through < archive.period.start ||
            through > last ||
            Boolean(
              archive.completedThrough && through < archive.completedThrough,
            )
          }
          onClick={async () => {
            await run("consolidate", { result: archive.result, through });
            onClose();
          }}
        >
          {t("Review completed work")}
        </button>
      </div>
    </dialog>
  );
}
