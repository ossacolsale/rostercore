import type { Result, Scenario } from "./model";
export async function coreAction(
  action: string,
  scenario: Scenario,
  extra: Record<string, unknown> = {},
): Promise<Result> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, scenario, ...extra }),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error || "Request failed");
  return result;
}
