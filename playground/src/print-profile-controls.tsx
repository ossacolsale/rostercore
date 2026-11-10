import { useState } from "react";
import type { ScheduleArchive } from "./archives";
import type { Presentation, ViewOptions } from "./calendar-export-model";
import {
  type PrintProfile,
  readPrintProfiles,
  savePrintProfile,
  applyPrintProfile,
  printProfileKey,
} from "./print-profiles";
import { Select, Text } from "./editors";
import { useI18n } from "./i18n";
export function PrintProfileControls({
  archive,
  options,
  presentation,
  onLoad,
  onLegacy,
}: {
  archive: ScheduleArchive;
  options: ViewOptions;
  presentation: Presentation;
  onLoad: (o: ViewOptions, p: Presentation) => void;
  onLegacy: () => void;
}) {
  const { t, language, localizeError } = useI18n();
  const [store, setStore] = useState(() => {
    try {
      return {
        profiles: readPrintProfiles(localStorage),
        error: "",
        legacy: Boolean(
          localStorage.getItem("rostercore.export-preferences.v1"),
        ),
      };
    } catch (e) {
      return {
        profiles: [] as PrintProfile[],
        error: (e as Error).message,
        legacy: false,
      };
    }
  });
  const [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const persist = (profiles: PrintProfile[]) => {
    try {localStorage.setItem(printProfileKey,JSON.stringify({version:1,profiles}));}
    catch {throw new Error('Print profiles could not be saved. Browser storage is full or disabled.');}
    setStore({ ...store, profiles });
  };
  const save = (replace: boolean) => {
    try {
      const result = savePrintProfile(
        store.profiles,
        name,
        archive,
        options,
        presentation,
        replace ? selected : undefined,
      );
      persist(result.profiles);
      setSelected(result.profile.id);
      setName(result.profile.name);
      setFeedback(
        t("Print profile saved: {name}", { name: result.profile.name }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="print-profiles" aria-label={t("Print profiles")}>
      <h3>{t("Print profiles")}</h3>
      {store.error && <p role="alert">{localizeError(store.error)}</p>}
      <Select
        label={t("Saved print profile")}
        value={selected}
        options={[
          { id: "", label: t("Current settings (not saved)") },
          ...store.profiles.map((p) => ({ id: p.id, label: p.name })),
        ]}
        onChange={(id) => {
          setSelected(id);
          setError("");
          if (!id) {
            setName("");
            setFeedback("");
            return;
          }
          const profile = store.profiles.find((p) => p.id === id)!;
          try {
            const loaded = applyPrintProfile(
              profile,
              archive,
              options,
              language,
            );
            onLoad(loaded.options, loaded.presentation);
            setName(profile.name);
            setFeedback(
              t(
                "Loaded {name}. Changes stay unsaved until you update it or save a new profile.",
                { name: profile.name },
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <Text label={t("Print profile name")} value={name} onChange={setName} />
      <div className="row">
        <button
          disabled={Boolean(store.error) || !name.trim()}
          onClick={() => save(false)}
        >
          {t("Save as new print profile")}
        </button>
        <button
          disabled={Boolean(store.error) || !selected || !name.trim()}
          onClick={() => save(true)}
        >
          {t("Update selected print profile")}
        </button>
        {selected && (
          <button
            disabled={Boolean(store.error)}
            onClick={() => {
              try {
                persist(store.profiles.filter((p) => p.id !== selected));
                setSelected("");
                setName("");
                setFeedback(
                  t(
                    "Print profile deleted. Current print settings are unchanged.",
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {t("Delete print profile")}
          </button>
        )}
      </div>
      {store.legacy && (
        <button
          onClick={() => {
            onLegacy();
            setSelected("");
            setName("");
            setFeedback(
              t(
                "Previous preferences loaded. Enter a name to save them as a print profile.",
              ),
            );
          }}
        >
          {t("Load previous export preferences")}
        </button>
      )}
      <p className="hint">
        {t(
          "Profiles stay in this browser. Edit a loaded profile and save it under a different name to keep both variants. Saved dates are clipped to this calendar; a different period keeps the current dates. Missing people and shifts are removed. Absence-reason permission is never saved.",
        )}
      </p>
      {feedback && <p role="status">{feedback}</p>}
      {error && <p role="alert">{localizeError(error)}</p>}
    </section>
  );
}
