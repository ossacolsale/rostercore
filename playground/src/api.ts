import { notifyError, notifyResult } from "./notifications";
import type { Result, Scenario } from "./model";
export async function coreAction(
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
    if (!options.silent) notifyResult(result,action);
    return result;
  } catch (e) {
    if (!options.silent) notifyError((e as Error).message);
    throw e;
  }
}
