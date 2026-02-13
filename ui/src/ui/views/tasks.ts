import { html, nothing } from "lit";
import type { GatewaySessionRow } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { pathForTab } from "../navigation.ts";

export type TaskRunRecord = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep";
  label?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok" | "error" | "timeout"; error?: string };
  /** The final output/findings from the subagent */
  findings?: string;
};

export type TaskStatusFilter = "all" | "running" | "completed" | "failed";

export type TasksProps = {
  loading: boolean;
  sessions: GatewaySessionRow[];
  tasks: TaskRunRecord[];
  error: string | null;
  basePath: string;
  statusFilter: TaskStatusFilter;
  deletingTaskKey: string | null;
  onStatusFilterChange: (filter: TaskStatusFilter) => void;
  onRefresh: () => void;
  onViewSession: (key: string) => void;
  onDeleteSession: (key: string) => Promise<void>;
  onAbortTask: (sessionKey: string) => void;
};

function isSubagentSession(row: GatewaySessionRow): boolean {
  return row.key.includes(":subagent:");
}

type TaskStatus = "running" | "completed" | "error" | "timeout" | "unknown";

function getTaskStatus(
  row: GatewaySessionRow,
  tasks: TaskRunRecord[],
): {
  status: TaskStatus;
  label?: string;
  task?: string;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  requesterDisplayKey?: string;
  runId?: string;
  findings?: string;
} {
  const taskRecord = tasks.find((t) => t.childSessionKey === row.key);
  if (taskRecord) {
    if (taskRecord.outcome) {
      const status =
        taskRecord.outcome.status === "ok"
          ? "completed"
          : taskRecord.outcome.status === "timeout"
            ? "timeout"
            : "error";
      return {
        status,
        label: taskRecord.label,
        task: taskRecord.task,
        startedAt: taskRecord.startedAt,
        endedAt: taskRecord.endedAt,
        error: taskRecord.outcome.error,
        requesterDisplayKey: taskRecord.requesterDisplayKey,
        runId: taskRecord.runId,
        findings: taskRecord.findings,
      };
    }
    return {
      status: "running",
      label: taskRecord.label,
      task: taskRecord.task,
      startedAt: taskRecord.startedAt,
      requesterDisplayKey: taskRecord.requesterDisplayKey,
      runId: taskRecord.runId,
      findings: taskRecord.findings,
    };
  }
  return {
    status: "unknown",
    label: row.label || undefined,
  };
}

function matchesFilter(status: TaskStatus, filter: TaskStatusFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "running") {
    return status === "running";
  }
  if (filter === "completed") {
    return status === "completed";
  }
  if (filter === "failed") {
    return status === "error" || status === "timeout";
  }
  return true;
}

function formatDuration(startMs?: number, endMs?: number): string {
  if (!startMs) {
    return "—";
  }
  const end = endMs || Date.now();
  const durationMs = end - startMs;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function truncateTask(task?: string, maxLen = 100): string {
  if (!task) {
    return "—";
  }
  if (task.length <= maxLen) {
    return task;
  }
  return task.slice(0, maxLen - 3) + "...";
}

/** Extract GitHub PR URLs from text */
function extractPrUrls(text?: string): string[] {
  if (!text) {
    return [];
  }
  const prRegex = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/g;
  const matches = text.match(prRegex);
  if (!matches) {
    return [];
  }
  // Remove duplicates
  return [...new Set(matches)];
}

/** Extract repo and PR number from a GitHub PR URL */
function parsePrUrl(url: string): { repo: string; number: string } | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (!match) {
    return null;
  }
  return { repo: match[1], number: match[2] };
}

export function renderTasks(props: TasksProps) {
  const subagentSessions = props.sessions.filter(isSubagentSession);

  // Calculate counts
  const counts = { all: 0, running: 0, completed: 0, failed: 0 };
  subagentSessions.forEach((row) => {
    const status = getTaskStatus(row, props.tasks).status;
    counts.all++;
    if (status === "running") {
      counts.running++;
    } else if (status === "completed") {
      counts.completed++;
    } else if (status === "error" || status === "timeout") {
      counts.failed++;
    }
  });

  // Filter sessions
  const filteredSessions = subagentSessions.filter((row) => {
    const status = getTaskStatus(row, props.tasks).status;
    return matchesFilter(status, props.statusFilter);
  });

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">Tasks</div>
          <div class="card-sub">
            Spawned sub-agent sessions.
            ${counts.running > 0 ? html`<span class="badge running">${counts.running} running</span>` : nothing}
          </div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <!-- Status Filter -->
      <div class="filters" style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
        ${(["all", "running", "completed", "failed"] as const).map((filter) => {
          const count = counts[filter];
          const isActive = props.statusFilter === filter;
          const label =
            filter === "all"
              ? "All"
              : filter === "running"
                ? "Running"
                : filter === "completed"
                  ? "Completed"
                  : "Failed";
          return html`
            <button
              class="filter-btn ${isActive ? "active" : ""} ${filter}"
              @click=${() => props.onStatusFilterChange(filter)}
            >
              ${label} <span class="count">(${count})</span>
            </button>
          `;
        })}
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filteredSessions.length === 0
          ? html`
            <div class="empty-state" style="margin-top: 24px; text-align: center; padding: 32px;">
              <div class="muted" style="font-size: 14px;">
                ${
                  subagentSessions.length === 0
                    ? "No spawned tasks found."
                    : `No ${props.statusFilter} tasks.`
                }
              </div>
              ${
                subagentSessions.length === 0
                  ? html`
                      <div class="muted" style="font-size: 12px; margin-top: 8px">
                        Use <code>sessions_spawn</code> tool to run parallel background tasks.
                      </div>
                    `
                  : nothing
              }
            </div>
          `
          : html`
            <div class="tasks-grid" style="margin-top: 16px; display: grid; gap: 12px;">
              ${filteredSessions.map((row) => renderTaskCard(row, props))}
            </div>
          `
      }
    </section>

    <style>
      .filters {
        display: flex;
        gap: 8px;
      }
      .filter-btn {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid var(--color-border, #333);
        background: transparent;
        color: var(--color-text, #ccc);
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      .filter-btn:hover {
        background: var(--color-hover, #2a2a2a);
      }
      .filter-btn.active {
        background: var(--color-primary-bg, #1e3a5f);
        border-color: var(--color-primary, #60a5fa);
        color: var(--color-primary, #60a5fa);
      }
      .filter-btn.active.running {
        background: var(--color-info-bg, #1e3a5f);
        border-color: var(--color-info, #60a5fa);
        color: var(--color-info, #60a5fa);
      }
      .filter-btn.active.completed {
        background: var(--color-success-bg, #14532d);
        border-color: var(--color-success, #22c55e);
        color: var(--color-success, #22c55e);
      }
      .filter-btn.active.failed {
        background: var(--color-danger-bg, #7f1d1d);
        border-color: var(--color-danger, #ef4444);
        color: var(--color-danger, #ef4444);
      }
      .filter-btn .count {
        opacity: 0.7;
      }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
        margin-left: 8px;
      }
      .badge.running {
        background: var(--color-info-bg, #1e3a5f);
        color: var(--color-info, #60a5fa);
      }
      .task-card {
        border: 1px solid var(--color-border, #333);
        border-radius: 8px;
        padding: 16px;
        background: var(--color-card-bg, #1a1a1a);
      }
      .task-card.running {
        border-color: var(--color-info, #60a5fa);
        border-width: 2px;
      }
      .task-card.completed {
        border-color: var(--color-success, #22c55e);
      }
      .task-card.error {
        border-color: var(--color-danger, #ef4444);
      }
      .task-card.timeout {
        border-color: var(--color-warning, #f59e0b);
      }
      .task-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .task-label {
        font-weight: 600;
        font-size: 14px;
      }
      .task-status {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        font-weight: 500;
      }
      .task-status.running {
        background: var(--color-info-bg, #1e3a5f);
        color: var(--color-info, #60a5fa);
      }
      .task-status.completed {
        background: var(--color-success-bg, #14532d);
        color: var(--color-success, #22c55e);
      }
      .task-status.error {
        background: var(--color-danger-bg, #7f1d1d);
        color: var(--color-danger, #ef4444);
      }
      .task-status.timeout {
        background: var(--color-warning-bg, #78350f);
        color: var(--color-warning, #f59e0b);
      }
      .task-status.unknown {
        background: var(--color-muted-bg, #333);
        color: var(--color-muted, #888);
      }
      .task-description {
        margin-top: 8px;
        font-size: 13px;
        color: var(--color-muted, #888);
        line-height: 1.4;
      }
      .task-meta {
        margin-top: 12px;
        display: flex;
        gap: 16px;
        font-size: 11px;
        color: var(--color-muted, #888);
        flex-wrap: wrap;
      }
      .task-actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .task-error {
        margin-top: 8px;
        padding: 8px;
        background: var(--color-danger-bg, #7f1d1d);
        color: var(--color-danger, #ef4444);
        border-radius: 4px;
        font-size: 12px;
      }
      .task-requester {
        margin-top: 8px;
        font-size: 11px;
        color: var(--color-muted, #888);
      }
      .task-key {
        font-family: monospace;
        font-size: 10px;
        color: var(--color-muted, #666);
        margin-top: 8px;
        word-break: break-all;
      }
      .btn.warning {
        background: var(--color-warning, #f59e0b);
        color: #000;
        border-color: var(--color-warning, #f59e0b);
      }
      .btn.warning:hover {
        background: var(--color-warning-hover, #d97706);
      }
      .btn.success {
        background: var(--color-success, #22c55e);
        color: #000;
        border-color: var(--color-success, #22c55e);
      }
      .btn.success:hover {
        background: var(--color-success-hover, #16a34a);
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .task-card.running .task-status {
        animation: pulse 2s ease-in-out infinite;
      }
      .task-pr-links {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        flex-wrap: wrap;
      }
      .pr-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: var(--color-success-bg, #14532d);
        color: var(--color-success, #22c55e);
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        text-decoration: none;
        transition: all 0.2s;
        border: 1px solid var(--color-success, #22c55e);
      }
      .pr-link:hover {
        background: var(--color-success, #22c55e);
        color: #000;
      }
      .pr-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
    </style>
  `;
}

function renderPrLinks(findings?: string) {
  const prUrls = extractPrUrls(findings);
  if (prUrls.length === 0) {
    return nothing;
  }
  return html`
    <div class="task-pr-links">
      ${prUrls.map((url) => {
        const parsed = parsePrUrl(url);
        const label = parsed ? `PR #${parsed.number}` : "Pull Request";
        return html`
          <a href=${url} target="_blank" rel="noopener noreferrer" class="pr-link">
            <svg class="pr-icon" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"></path>
            </svg>
            ${label}
          </a>
        `;
      })}
    </div>
  `;
}

function renderTaskCard(row: GatewaySessionRow, props: TasksProps) {
  const taskInfo = getTaskStatus(row, props.tasks);
  const chatUrl = `${pathForTab("chat", props.basePath)}?session=${encodeURIComponent(row.key)}`;
  const isRunning = taskInfo.status === "running";
  const isDeleting = props.deletingTaskKey === row.key;
  const prUrls = extractPrUrls(taskInfo.findings);

  return html`
    <div class="task-card ${taskInfo.status}">
      <div class="task-header">
        <div class="task-label">${taskInfo.label || row.label || "Unnamed Task"}</div>
        <div class="task-status ${taskInfo.status}">${taskInfo.status}</div>
      </div>

      ${renderPrLinks(taskInfo.findings)}

      ${
        taskInfo.task
          ? html`<div class="task-description">${truncateTask(taskInfo.task)}</div>`
          : nothing
      }

      ${taskInfo.error ? html`<div class="task-error">Error: ${taskInfo.error}</div>` : nothing}

      <div class="task-meta">
        <span>Started: ${taskInfo.startedAt ? formatRelativeTimestamp(taskInfo.startedAt) : row.updatedAt ? formatRelativeTimestamp(row.updatedAt) : "—"}</span>
        <span>Duration: ${formatDuration(taskInfo.startedAt, taskInfo.endedAt)}</span>
        ${row.totalTokens ? html`<span>Tokens: ${row.totalTokens.toLocaleString()}</span>` : nothing}
      </div>

      ${
        taskInfo.requesterDisplayKey
          ? html`<div class="task-requester">Spawned by: ${taskInfo.requesterDisplayKey}</div>`
          : nothing
      }

      <div class="task-key">${row.key}</div>

      <div class="task-actions">
        <a href=${chatUrl} class="btn small">View Chat</a>
        ${
          prUrls.length > 0
            ? html`
              <a href=${prUrls[0]} target="_blank" rel="noopener noreferrer" class="btn small success">
                View PR
              </a>
            `
            : nothing
        }
        ${
          isRunning
            ? html`
              <button
                class="btn small warning"
                ?disabled=${props.loading}
                @click=${() => props.onAbortTask(row.key)}
              >
                Abort
              </button>
            `
            : nothing
        }
        <button
          class="btn small danger"
          ?disabled=${props.loading || isDeleting}
          @click=${() => props.onDeleteSession(row.key)}
        >
          ${isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  `;
}
