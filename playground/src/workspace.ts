import type { ScheduleArchive } from "./archives";
import type { Scenario } from "./model";

export type Workspace = {
  id: string;
  revision: number;
  session?: string;
  scenario: Scenario | null;
  archives: ScheduleArchive[];
  activeArchiveId: string | null;
};

export type Location = {
  mode: "LOCAL" | "HOST" | "CLIENT";
  location: string;
  warning?: string;
  selected?: boolean;
};

export type Revision = {
  revision: number;
  scenarioId: string;
  scenarioRevision: number;
  savedAt: string;
};

declare global {
  interface Window {
    rosterCore?: {
      chooseFile: (operation: "CREATE" | "OPEN" | "BACKUP", suggestedPath?: string) => Promise<string | undefined>;
    };
  }
}

export class WorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function workspaceRequest<T>(endpoint: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new WorkspaceError("Cannot reach the workspace service.", 503);
  }
  const data = await response.json();
  if (!response.ok) throw new WorkspaceError(data.error, response.status);
  return data;
}
