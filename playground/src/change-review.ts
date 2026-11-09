import type { Scenario, Result } from "./model";
import type { ScheduleArchive } from "./archives";
import type { Run } from "./results";
import { coreAction } from "./api";
export type ChangeSet = {
  format: "rostercore.scenario-change-set";
  schemaVersion: 1;
  id: string;
  scenarioId: string;
  expectedRevision: number;
  expectedConfigurationHash?: string;
  allowHardRuleChanges: boolean;
  referenceDate?: string;
  description?: string;
  operations: Record<string, unknown>[];
};
export type ChangeReview = {
  scenario: Scenario;
  document: ChangeSet;
  result: Result;
  proposal?: { archiveId: string; from: string };
  signature: string;
};
export async function reviewChange(
  s: Scenario,
  doc: ChangeSet,
  archives: ScheduleArchive[],
  proposal?: { archiveId: string; from: string },
): Promise<ChangeReview> {
  let context = s;
  if (proposal) {
    const r = await coreAction(
      "archives",
      s,
      {
        document: {
          operation: "REVISE",
          id: proposal.archiveId,
          from: proposal.from,
          archives,
          expectedRevision: s.revision,
          dryRun: true,
        },
      },
      { silent: true },
    );
    if (r.status !== "PREVIEW")
      return {
        scenario: s,
        document: doc,
        result: r,
        signature: JSON.stringify(s),
      };
    context = (r.preview as { scenario: Scenario }).scenario;
    doc = { ...doc, expectedRevision: context.revision };
    if (doc.expectedConfigurationHash) {
      const c = await coreAction("context", context, {}, { silent: true });
      doc.expectedConfigurationHash = (
        c.context as { configurationHash: string }
      ).configurationHash;
    }
  }
  const result = await coreAction(
    "change-set",
    context,
    { document: doc, apply: false },
    { silent: true },
  );
  return {
    scenario: context,
    document: doc,
    result,
    proposal,
    signature: JSON.stringify(s),
  };
}
export async function applyReviewedChange(
  review: ChangeReview,
  current: Scenario,
  archives: ScheduleArchive[],
  run: Run,
) {
  if (review.signature !== JSON.stringify(current))
    throw new Error(
      "Configuration changed after preview. Review the change again.",
    );
  let context = current;
  if (review.proposal) {
    const result = await run("archives", {
      scenario: current,
      document: {
        operation: "REVISE",
        id: review.proposal.archiveId,
        from: review.proposal.from,
        archives,
        expectedRevision: current.revision,
        dryRun: false,
      },
    });
    if (!result?.scenario) return result;
    context = result.scenario;
  }
  return run("change-set", {
    scenario: context,
    document: { ...review.document, expectedRevision: context.revision },
    apply: true,
  });
}
export function proposedCalendar(
  s: Scenario,
  archives: ScheduleArchive[],
  from: string,
) {
  return archives.find(
    (a) =>
      a.scenarioId === s.id &&
      a.state !== "SUPERSEDED" &&
      s.archiveState?.publishedIds.includes(a.id) &&
      a.period.start <= from &&
      a.period.end >= from,
  );
}
