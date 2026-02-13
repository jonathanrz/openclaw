import type { GatewayRequestHandlers } from "./types.js";
import {
  listAllSubagentRuns,
  listSubagentRunsForRequester,
  type SubagentRunRecord,
} from "../../agents/subagent-registry.js";

export type TasksListResult = {
  ts: number;
  tasks: SubagentRunRecord[];
};

export const tasksHandlers: GatewayRequestHandlers = {
  "tasks.list": ({ params, respond }) => {
    const p = params as { requesterSessionKey?: string } | undefined;
    const requesterKey =
      typeof p?.requesterSessionKey === "string" ? p.requesterSessionKey.trim() : "";

    const tasks = requesterKey
      ? listSubagentRunsForRequester(requesterKey)
      : listAllSubagentRuns();

    // Sort by createdAt descending (newest first)
    tasks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    const result: TasksListResult = {
      ts: Date.now(),
      tasks,
    };
    respond(true, result, undefined);
  },
};
