import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Result } from "./model";
import { useI18n } from "./i18n";
type Kind = "SUCCESS" | "INFORMATION" | "WARNING" | "ERROR";
type Notice = {
  id: number;
  kind: Kind;
  key: string;
  count: number;
  message?: string;
  raw?: string;
  result?: Result;
};
let notices: Notice[] = [];
let serial = 0;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((fn) => fn());
export function dismissNotification(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  notices = notices.filter((n) => n.id !== id);
  emit();
}
function enqueue(input: Omit<Notice, "id" | "count">) {
  const existing = notices.find((n) => n.key === input.key);
  const id = existing?.id ?? ++serial;
  const next = { ...input, id, count: (existing?.count ?? 0) + 1 };
  if (existing) notices = notices.map((n) => (n.id === id ? next : n));
  else if (notices.length < 8) notices = [...notices, next];
  else {
    const expendable = notices.find((n) => n.kind !== "ERROR");
    if (expendable) {
      dismissNotification(expendable.id);
      notices = [...notices, next];
    } else {
      const last = notices.at(-1)!;
      const previous = last.result?.diagnostics ?? [
        {
          code: "OPERATION",
          path: "/",
          message: last.raw ?? last.message ?? "",
        },
      ];
      const incoming = input.result?.diagnostics ?? [
        {
          code: "OPERATION",
          path: "/",
          message: input.raw ?? input.message ?? "",
        },
      ];
      const combined = [
        ...new Map(
          [...previous, ...incoming].map((d) => [JSON.stringify(d), d]),
        ).values(),
      ];
      notices = [
        ...notices.slice(0, -1),
        {
          ...last,
          count: last.count + 1,
          result: {
            status: "VALIDATION_ERROR",
            diagnostics: combined,
          },
        },
      ];
      emit();
      return;
    }
  }
  scheduleDismissal(next);
  emit();
}
function scheduleDismissal(n: Notice) {
  clearTimeout(timers.get(n.id));
  const duration =
    n.kind === "SUCCESS"
      ? 5000
      : n.kind === "INFORMATION" && n.result?.status !== "PREVIEW"
        ? 7500
        : n.kind === "WARNING" && !n.result?.diagnostics.length
          ? 15000
          : 0;
  if (duration && notices.some((x) => x.id === n.id))
    timers.set(
      n.id,
      setTimeout(() => dismissNotification(n.id), duration),
    );
}
export function notifyMessage(message: string, kind: Kind = "SUCCESS") {
  enqueue({ message, kind, key: kind + ":" + message });
}
export function notifyError(raw: string) {
  enqueue({ raw, kind: "ERROR", key: "ERROR:" + raw });
}
const operationLabels: Record<string, string> = {
  validate: "Scenario validation",
  solve: "Schedule generation",
  inspect: "Workforce preview",
  "inspect-patterns": "Work-pattern assignment preview",
  select: "Selector preview",
  "import-policy": "Policy import",
  "sync-hr": "HR synchronization",
  regenerate: "Calendar regeneration",
  migrate: "Scenario migration",
  verify: "Independent verification",
  consolidate: "History consolidation",
  context: "AI authoring context",
  "rebuild-history": "History rebuilding",
};
export function notifyResult(result: Result, operation?: string) {
  const errors = result.diagnostics.filter(
    (d) => (d.severity ?? "ERROR") === "ERROR",
  );
  const kind: Kind =
    errors.length ||
    ["VALIDATION_ERROR", "MODEL_INVALID"].includes(result.status)
      ? "ERROR"
      : ["INFEASIBLE", "UNKNOWN", "FEASIBLE"].includes(result.status) ||
          result.diagnostics.some((d) => d.severity === "WARNING")
        ? "WARNING"
        : ["INSPECTED", "CONTEXT", "PREVIEW"].includes(result.status)
          ? "INFORMATION"
          : "SUCCESS";
  enqueue({
    kind,
    result,
    message: operation ? operationLabels[operation] : undefined,
    key: (operation ?? "") + result.status + JSON.stringify(result.diagnostics),
  });
}
export function NotificationCenter() {
  const { t, diagnostic, localizeError } = useI18n();
  const items = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => notices,
  );
  const [details, setDetails] = useState<Notice>(),
    [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (details) dialog.current?.showModal();
  }, [details]);
  useEffect(() => {
    const node = region.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        "--notification-space",
        `${node.getBoundingClientRect().height + 20}px`,
      ),
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--notification-space");
    };
  }, [items.length, expanded]);
  const visible = expanded ? items : items.slice(-3);
  return (
    <>
      <section
        ref={region}
        className="notification-center"
        aria-label={t("Operation notifications")}
        data-testid="notification-center"
      >
        {items.length > 3 && (
          <button
            className="notification-queue"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? t("Show fewer notifications")
              : t("Queued notifications: {count}", { count: items.length - 3 })}
          </button>
        )}
        {visible.map((n) => (
          <article
            key={n.id}
            className={`notification ${n.kind.toLowerCase()}`}
            role={n.kind === "ERROR" ? "alert" : "status"}
            aria-live={n.kind === "ERROR" ? "assertive" : "polite"}
            aria-atomic="true"
            onMouseEnter={() => clearTimeout(timers.get(n.id))}
            onMouseLeave={() => scheduleDismissal(n)}
            onFocusCapture={() => clearTimeout(timers.get(n.id))}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                scheduleDismissal(n);
            }}
          >
            <span className="notification-icon" aria-hidden="true">
              {n.kind === "ERROR"
                ? "!"
                : n.kind === "WARNING"
                  ? "⚠"
                  : n.kind === "SUCCESS"
                    ? "✓"
                    : "i"}
            </span>
            <div>
              <strong>{t(n.kind)}</strong>
              {n.count > 1 && <span className="badge">×{n.count}</span>}
              <p>
                {n.result ? (
                  <>
                    {n.message && <span>{t(n.message)} · </span>}
                    <b>{t(n.result.status)}</b>
                    {n.result.diagnostics.some(
                      (d) => (d.severity ?? "ERROR") === "ERROR",
                    )
                      ? ` · ${t("Errors detected: {count}", { count: n.result.diagnostics.filter((d) => (d.severity ?? "ERROR") === "ERROR").length })}`
                      : n.result.status === "INFEASIBLE"
                        ? ` · ${t("No schedule satisfies the configured hard rules.")}`
                        : n.result.status === "UNKNOWN"
                          ? ` · ${t("No schedule was found within the search budget.")}`
                          : n.result.status === "FEASIBLE"
                            ? ` · ${t("A valid schedule was found; optimality is not proved.")}`
                            : ""}
                  </>
                ) : n.raw ? (
                  localizeError(n.raw)
                ) : (
                  t(n.message ?? "")
                )}
              </p>
              {n.result && n.result.diagnostics.length > 0 && (
                <button onClick={() => setDetails(n)}>
                  {t("View diagnostics")}
                </button>
              )}
            </div>
            <button
              className="notification-close"
              aria-label={t("Dismiss notification")}
              onClick={() => dismissNotification(n.id)}
            >
              ×
            </button>
          </article>
        ))}
      </section>
      <dialog
        ref={dialog}
        className="diagnostic-dialog"
        onCancel={() => setDetails(undefined)}
        onClose={() => setDetails(undefined)}
        aria-label={t("Operation diagnostics")}
      >
        <h2>{t("Operation diagnostics")}</h2>
        {details?.result?.diagnostics.map((d, i) => (
          <section className="diagnostic" key={i}>
            <b>{d.code}</b> <code>{d.path}</code>
            <span className="badge">{t(d.severity ?? "ERROR")}</span>
            <p>{diagnostic(d)}</p>
            {d.suggestion && <p>{localizeError(d.suggestion)}</p>}
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("rostercore:editor", {
                    detail: d.path.includes("variants")
                      ? "variants"
                      : (d.section ??
                        (d.path.startsWith("/week")
                          ? "weeks"
                          : d.path.startsWith("/workPattern")
                            ? "contracts"
                            : d.path.startsWith("/calendar")
                              ? "calendar"
                              : d.path.startsWith("/shifts")
                                ? "shifts"
                                : d.path.startsWith("/duty") ||
                                    d.path.startsWith("/temporal")
                                  ? "coverage"
                                  : d.path.startsWith("/policies")
                                    ? "policies"
                                    : "people")),
                  }),
                );
                dialog.current?.close();
              }}
            >
              {t("Open related editor")}
            </button>
            <details>
              <summary>{t("Original message")}</summary>
              <pre lang="en">{d.message}</pre>
            </details>
          </section>
        ))}
        <button onClick={() => dialog.current?.close()}>
          {t("Close diagnostics")}
        </button>
      </dialog>
    </>
  );
}
