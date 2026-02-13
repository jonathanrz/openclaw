import type { TaskRunRecord } from "../views/tasks.ts";

export type TasksState = {
  tasksLoading: boolean;
  tasksResult: TasksListResult | null;
  tasksError: string | null;
  client: { call: (method: string, params?: unknown) => Promise<unknown> } | null;
};

export type TasksListResult = {
  ts: number;
  tasks: TaskRunRecord[];
};

export async function loadTasks(state: TasksState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client) {
    if (!opts?.quiet) {
      state.tasksError = "Not connected";
    }
    return;
  }
  if (!opts?.quiet) {
    state.tasksLoading = true;
    state.tasksError = null;
  }
  try {
    const result = (await state.client.call("tasks.list", {})) as TasksListResult;
    state.tasksResult = result;
    if (!opts?.quiet) {
      state.tasksError = null;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.tasksError = err instanceof Error ? err.message : "Failed to load tasks";
    }
  } finally {
    if (!opts?.quiet) {
      state.tasksLoading = false;
    }
  }
}

export function hasRunningTasks(state: TasksState): boolean {
  const tasks = state.tasksResult?.tasks ?? [];
  return tasks.some((task) => !task.outcome);
}

export type AbortState = {
  client: { call: (method: string, params?: unknown) => Promise<unknown> } | null;
};

export async function abortTask(state: AbortState, sessionKey: string): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    await state.client.call("agent.abort", { sessionKey });
  } catch (err) {
    console.error("Failed to abort task:", err);
  }
}
