import { expect, type APIRequestContext, type TestInfo } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export const example = async () =>
  JSON.parse(await readFile(new URL("../../AI_EXAMPLES/01-create-scenario.json", import.meta.url), "utf8"));
export const state = async (request: APIRequestContext) => (await request.get("/api/workspace")).json();

export async function openWorkspace(request: APIRequestContext, info: TestInfo, candidate?: object) {
  const file = info.outputPath("workspace.sqlite");
  await mkdir(path.dirname(file), { recursive: true });
  const response = await request.post("/api/workspace/location", { data: { operation: "CREATE", path: file } });
  expect(response.ok(), await response.text()).toBe(true);
  if (!candidate) return;
  const { workspace: { id, session, revision } } = await response.json();
  const imported = await request.post("/api/workspace/run", { data: {
    action: "import-scenario", expected: { id, session, revision }, apply: true,
    document: { candidate, expectedRevision: 0, allowHardRuleChanges: false, mode: "NEW_SCENARIO" },
  } });
  const { result } = await imported.json();
  expect(result.status, JSON.stringify(result.diagnostics)).toBe("IMPORTED");
}
