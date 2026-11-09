import { notifyError, notifyResult } from "./notifications";
import type { Result, Scenario } from "./model";
async function executeCoreAction(
  action: string,
  scenario: Scenario,
  extra: Record<string, unknown> = {},
  options: { silent?: boolean } = {},
): Promise<Result> {
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, scenario, ...extra }),
    });
    const result = await response.json();
    if (!response.ok || result.error)
      throw new Error(result.error || "Request failed");
    if (!options.silent) notifyResult(result, action);
    return result;
  } catch (e) {
    if (!options.silent) notifyError((e as Error).message);
    throw e;
  }
}

// Background native previews share one slot, leaving room for an explicit user action.
let previews: Promise<unknown> = Promise.resolve();
export function coreAction(
  ...args: Parameters<typeof executeCoreAction>
): Promise<Result> {
  const job = previews.then(() => executeCoreAction(...args));
  previews = job.catch(() => undefined);
  return job;
}
