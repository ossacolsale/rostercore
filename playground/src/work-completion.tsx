import { useState } from "react";
import type { ScheduleArchive } from "./archives";
import type { Run } from "./api";
import { useI18n } from "./i18n";
import { Modal } from "./review-dialog";
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
  const today = calendarToday(archive.scenario.calendar.timezone),
    last = today < archive.period.end ? today : archive.period.end;
  const [through, setThrough] = useState(last),
    [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  return (
    <Modal title={t("Record work performed")} onClose={onClose} dismissible={!working} actions={<>
        <button disabled={working} onClick={onClose}>{t("Cancel")}</button>
        <button
          className="primary"
          disabled={
            working || !confirmed ||
            through < archive.period.start ||
            through > last ||
            Boolean(
              archive.completedThrough && through < archive.completedThrough,
            )
          }
          onClick={async () => {
            setWorking(true);
            try {
              const result = await run("consolidate", { result: archive.result, through });
              if (result?.status === "PREVIEW") onClose();
            } finally { setWorking(false); }
          }}
        >
          {t("Review completed work")}
        </button>
    </>}>
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
    </Modal>
  );
}
