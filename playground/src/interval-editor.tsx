import { useI18n } from "./i18n";
import { Select, Text } from "./editors";
import type { Interval } from "./evolution-model";
export function IntervalEditor({
  value,
  onChange,
}: {
  value: Interval[];
  onChange: (v: Interval[]) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="hint">
        {t(
          "Intervals use local civil times. Next-day ends are explicit; ambiguous DST times require a fold.",
        )}
      </div>
      {value.map((v, i) => (
        <div className="row" key={i}>
          <Text
            label={t("Start")}
            type="time"
            value={v.start}
            onChange={(x) =>
              onChange(value.map((a, j) => (i === j ? { ...a, start: x } : a)))
            }
          />
          <Text
            label={t("End")}
            type="time"
            value={v.end}
            onChange={(x) =>
              onChange(value.map((a, j) => (i === j ? { ...a, end: x } : a)))
            }
          />
          <Select
            label={t("End date")}
            value={String(v.endDayOffset)}
            options={[
              { id: "0", label: t("Same day") },
              { id: "1", label: t("Next day") },
            ]}
            onChange={(x) =>
              onChange(
                value.map((a, j) =>
                  i === j ? { ...a, endDayOffset: Number(x) } : a,
                ),
              )
            }
          />
          <button
            aria-label={t("Remove interval")}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            ×
          </button>
          <details>
            <summary>{t("DST ambiguity")}</summary>
            {(["startFold", "endFold"] as const).map((key) => (
              <Select
                key={key}
                label={key === "startFold" ? t("Start fold") : t("End fold")}
                value={v[key] === undefined ? "" : String(v[key])}
                options={[
                  { id: "", label: t("Reject ambiguous time") },
                  { id: "0", label: t("Earlier occurrence") },
                  { id: "1", label: t("Later occurrence") },
                ]}
                onChange={(x) => {
                  const next = structuredClone(value);
                  if (x === "") delete next[i][key];
                  else next[i][key] = Number(x) as 0 | 1;
                  onChange(next);
                }}
              />
            ))}
          </details>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...value,
            { start: "09:00", end: "17:00", endDayOffset: 0 },
          ])
        }
      >{t("Add time interval")}</button>
    </>
  );
}
