import { randomUUID } from "node:crypto";

const generation = new Set(["solve", "regenerate", "improve"]);
const archiveReads = new Set(["OPEN", "VIEW", "CSV", "BACKUP"]);
const acceptedGeneration = new Set(["OPTIMAL", "FEASIBLE"]);
const actions = new Set([
  ...generation, "archives", "change-set", "import-scenario", "validate", "verify",
  "verify-quality", "context", "recover-browser",
]);

const todayIn = (zone) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  return ["year", "month", "day"].map((part) => parts.find((p) => p.type === part).value).join("-");
};

export async function workspaceOperation(run, snapshot, body) {
  const { action, document, proposal } = body;
  if (!actions.has(action)) throw new Error("Unsupported workspace action");
  const next = { ...snapshot };
  const finish = (result) => ({ result, next });
  const discard = (result) => ({ result, next: snapshot });
  const archive = (doc, scenario = next.scenario, archives = next.archives) =>
    run({ action: "archives", scenario, document: { ...doc, archives } });

  if (action === "recover-browser") {
    if (snapshot.scenario) throw new Error("Recover browser data into an empty workspace.");
    if (!document?.scenario || !Array.isArray(document.archives))
      throw new Error("No valid browser workspace was found.");
    const checked = await archive({ operation: "BACKUP", dryRun: true, createdAt: new Date().toISOString() },
      document.scenario, document.archives);
    if (checked.status !== "EXPORTED") return discard(checked);
    return workspaceOperation(run, snapshot, {
      action: "archives", document: { operation: "RESTORE", dryRun: document.dryRun,
        backup: checked.document, expectedRevision: document.scenario.revision },
    });
  }

  if (action === "archives") {
    const scenario = snapshot.scenario ?? (document?.operation === "RESTORE" ? document.backup?.scenario : null);
    if (!scenario) throw new Error("Create or import a configuration first.");
    if (document.operation === "COMPLETE" || (document.operation === "IMPORT" && document.mode === "COMPLETE")) {
      const through = document.through ?? document.archive?.completedThrough;
      if (!through || through > todayIn(scenario.calendar.timezone))
        throw new Error("Future work cannot be confirmed as completed. Choose a date on or before today.");
    }
    const result = await archive(document, scenario);
    if (archiveReads.has(document.operation) || document.dryRun || !result.archives)
      return discard(result);
    next.scenario = result.scenario ?? scenario;
    next.archives = result.archives;
    if (["RESTORE", "IMPORT"].includes(document.operation)) next.activeArchiveId = null;
    return finish(result);
  }

  if (!next.scenario && action !== "import-scenario")
    throw new Error("Create or import a configuration first.");

  if (action === "import-scenario" && snapshot.scenario && document?.mode === "NEW_SCENARIO")
    throw new Error("Create a separate workspace for a different configuration.");

  if (proposal) {
    if (!generation.has(action) && !(action === "change-set" && body.apply === true))
      throw new Error("A revision proposal requires a confirmed change or generation.");
    const revised = await archive({
      operation: "REVISE", id: proposal.archiveId, from: proposal.from,
      expectedRevision: snapshot.scenario.revision, dryRun: false,
    });
    if (!revised.scenario) return discard(revised);
    next.scenario = revised.scenario;
    next.archives = revised.archives;
  }

  const contextArchive = ["verify", "verify-quality"].includes(action)
    ? snapshot.archives.find((item) => item.id === body.archiveId)
    : undefined;
  if (["verify", "verify-quality"].includes(action) && !contextArchive)
    throw new Error("Choose a saved calendar to verify.");

  let nativeDocument = contextArchive?.result ?? document;
  if (action === "regenerate") {
    const previous = snapshot.archives.find((archive) => archive.id === document?.previousArchiveId);
    if (!previous || previous.scenarioId !== next.scenario.id)
      throw new Error("Choose a saved calendar for this configuration to regenerate.");
    nativeDocument = { from: document.from, stabilityPriority: document.stabilityPriority,
      previousScenario: previous.scenario, previousScenarioEncoding: previous.scenarioEncoding,
      previousResult: previous.result };
  }
  const result = await run({
    action,
    scenario: contextArchive?.scenario ?? next.scenario,
    scenarioEncoding: contextArchive?.scenarioEncoding,
    document: nativeDocument,
    apply: body.apply,
  });
  if (generation.has(action)) {
    if (!result.assignments || !acceptedGeneration.has(result.status)) return discard(result);
    next.scenario = result.scenario ?? next.scenario;
    const saved = await archive({
      operation: "CREATE", id: "schedule-" + randomUUID(),
      result, createdAt: new Date().toISOString(), source: "rostercore",
      expectedRevision: next.scenario.revision, dryRun: false,
    });
    if (saved.status !== "ARCHIVED") return discard(saved);
    next.archives = saved.archives;
    next.activeArchiveId = saved.archive.id;
    return finish(result);
  }
  if (!["change-set", "import-scenario"].includes(action) || !result.scenario)
    return discard(result);
  next.scenario = result.scenario;
  if (snapshot.scenario?.id !== next.scenario.id) next.activeArchiveId = null;
  if (action === "change-set" && body.regeneration) {
    const generated = await workspaceOperation(run, next, {
      action: "regenerate", document: body.regeneration,
    });
    return generated.next === next
      ? finish({ ...result, generationFailure: generated.result })
      : generated;
  }
  return finish(result);
}
