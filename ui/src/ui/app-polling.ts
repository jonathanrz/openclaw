import type { OpenClawApp } from "./app.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadTasks, hasRunningTasks } from "./controllers/tasks.ts";
import { loadSessions } from "./controllers/sessions.ts";

type PollingHost = {
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  tasksPollInterval: number | null;
  tab: string;
};

export function startNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval != null) {
    return;
  }
  host.nodesPollInterval = window.setInterval(
    () => void loadNodes(host as unknown as OpenClawApp, { quiet: true }),
    5000,
  );
}

export function stopNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval == null) {
    return;
  }
  clearInterval(host.nodesPollInterval);
  host.nodesPollInterval = null;
}

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) {
    return;
  }
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "logs") {
      return;
    }
    void loadLogs(host as unknown as OpenClawApp, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) {
    return;
  }
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) {
    return;
  }
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "debug") {
      return;
    }
    void loadDebug(host as unknown as OpenClawApp);
  }, 3000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) {
    return;
  }
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}

const TASKS_POLL_INTERVAL_FAST = 3000; // 3s when tasks are running
const TASKS_POLL_INTERVAL_SLOW = 15000; // 15s when idle

export function startTasksPolling(host: PollingHost) {
  if (host.tasksPollInterval != null) {
    return;
  }
  const poll = async () => {
    if (host.tab !== "tasks") {
      return;
    }
    await loadTasks(host as unknown as OpenClawApp, { quiet: true });
    // Also refresh sessions to get updated token counts
    await loadSessions(host as unknown as OpenClawApp, { quiet: true });
    
    // Adjust polling interval based on whether tasks are running
    const running = hasRunningTasks(host as unknown as OpenClawApp);
    const currentInterval = running ? TASKS_POLL_INTERVAL_FAST : TASKS_POLL_INTERVAL_SLOW;
    
    // Restart with new interval if needed
    if (host.tasksPollInterval != null) {
      clearInterval(host.tasksPollInterval);
      host.tasksPollInterval = window.setInterval(() => void poll(), currentInterval);
    }
  };
  host.tasksPollInterval = window.setInterval(() => void poll(), TASKS_POLL_INTERVAL_FAST);
}

export function stopTasksPolling(host: PollingHost) {
  if (host.tasksPollInterval == null) {
    return;
  }
  clearInterval(host.tasksPollInterval);
  host.tasksPollInterval = null;
}
