import {
  Command,
  MenuItem,
  Panel,
  Plugin,
  Slot,
  Style,
  type PanelTab,
  type PluginContext,
  type UiMenuEntry,
} from "@opencode/plugin/gui";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import cssText from "./gui.css?inline";
import {
  BackupRpc,
  type BackupDiffLineDto,
  type BackupEntryDto,
  type BackupSettingsDto,
} from "./rpc.js";

type ToolFilter = "all" | "edit" | "write" | "patch" | "pre-restore";
type DateFilter = "all" | "24h" | "7d" | "30d";
type ScopeMode = "scan-root" | "workspace";

const TOOL_CYCLE: ToolFilter[] = ["all", "edit", "write", "patch", "pre-restore"];
const DATE_CYCLE: DateFilter[] = ["all", "24h", "7d", "30d"];
const RETENTION_PRESETS: number[] = [30, 14, 7, 5, 0];

function formatAge(timestampMs: number): string {
  if (!timestampMs) return "unknown";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function formatDateTime(timestampMs: number): string {
  if (!timestampMs) return "unknown";
  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getBackupDisplayPath(backupPath: string): string {
  const normalized = String(backupPath || "").replace(/\\/g, "/");
  const idx = normalized.indexOf("/.backups/");
  if (idx <= 0) return normalized;
  const projectRoot = normalized.slice(0, idx);
  const lastSlash = projectRoot.lastIndexOf("/");
  const parentRoot = lastSlash > 0 ? projectRoot.slice(0, lastSlash) : "";
  if (parentRoot && normalized.startsWith(parentRoot + "/")) {
    return normalized.slice(parentRoot.length + 1);
  }
  return normalized;
}

function splitHighlightSegments(
  text: string,
  terms: string[],
): Array<{ text: string; match: boolean }> {
  const source = String(text || "");
  if (!source) return [{ text: "", match: false }];
  const cleanTerms = terms
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (cleanTerms.length === 0) return [{ text: source, match: false }];

  const lower = source.toLowerCase();
  const intervals: Array<[number, number]> = [];
  for (const term of cleanTerms) {
    let idx = 0;
    while (idx < lower.length) {
      const found = lower.indexOf(term, idx);
      if (found === -1) break;
      intervals.push([found, found + term.length]);
      idx = found + Math.max(1, term.length);
    }
  }
  if (intervals.length === 0) return [{ text: source, match: false }];
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [intervals[0]!];
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = intervals[i]!;
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push([curr[0], curr[1]]);
    }
  }

  const segments: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: source.slice(cursor, start), match: false });
    }
    segments.push({ text: source.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), match: false });
  }
  return segments;
}

function HighlightedText(props: { text: string; terms: string[] }) {
  const segments = createMemo(() => splitHighlightSegments(props.text, props.terms));
  return (
    <For each={segments()}>
      {(seg) => (
        <Show when={seg.match} fallback={<>{seg.text}</>}>
          <mark class="oc-lb-mark">{seg.text}</mark>
        </Show>
      )}
    </For>
  );
}

function getRpcClient(ctx: PluginContext) {
  const activeSession = ctx.sessions.current() as any;
  if (activeSession?.server?.client?.rpc) {
    return activeSession.server.client.rpc(BackupRpc);
  }
  const servers = (ctx as any).servers;
  if (servers) {
    const list = typeof servers.list === "function" ? servers.list() : [];
    for (const s of list) {
      if (s?.client?.rpc) return s.client.rpc(BackupRpc);
      if (s?.id && typeof servers.get === "function") {
        const handle = servers.get(s.id);
        if (handle?.client?.rpc) return handle.client.rpc(BackupRpc);
      }
    }
    if (typeof servers.get === "function") {
      const local = servers.get("local") || servers.get("default");
      if (local?.client?.rpc) return local.client.rpc(BackupRpc);
    }
  }
  const directClient = (ctx as any).client;
  if (directClient?.rpc) {
    return directClient.rpc(BackupRpc);
  }
  return null;
}

function BackupManagerView(props: {
  ctx: PluginContext;
  surface: "panel" | "modal";
  initialQuery?: string;
  onClose?: () => void;
}) {
  const { ui } = props.ctx;

  const [allEntries, setAllEntries] = createSignal<BackupEntryDto[]>([]);
  const [scanRoot, setScanRoot] = createSignal<string>("");
  const [workspaceDir, setWorkspaceDir] = createSignal<string>("");
  const [scopeMode, setScopeMode] = createSignal<ScopeMode>("scan-root");
  const [settings, setSettings] = createSignal<BackupSettingsDto>({
    retentionDays: 30,
    debounceMs: 0,
    rootDir: "",
    dialogWidth: "80%",
  });

  const [query, setQuery] = createSignal(props.initialQuery || "");

  // External openers (commands, intercepted clicks) push the query here.
  createEffect(() => {
    const q = ocLbPanelQuery();
    if (q) setQuery(q);
  });

  const [toolFilter, setToolFilter] = createSignal<ToolFilter>("all");
  const [dateFilter, setDateFilter] = createSignal<DateFilter>("all");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [diffLoading, setDiffLoading] = createSignal(false);
  const [diffState, setDiffState] = createSignal<{
    status: string;
    summary: string;
    lines: BackupDiffLineDto[];
  } | null>(null);
  const [confirmRestoreModal, setConfirmRestoreModal] = createSignal(false);
  const [statusMsg, setStatusMsg] = createSignal<{
    text: string;
    kind: "ok" | "warn" | "err";
  } | null>(null);

  let searchInputRef: HTMLInputElement | undefined;
  const rowRefs = new Map<number, HTMLDivElement>();

  const colorScheme = createMemo(() => {
    const pref = props.ctx.appearance.mode();
    if (pref === "light" || pref === "dark") return pref;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  });

  function flashStatus(text: string, kind: "ok" | "warn" | "err" = "ok") {
    setStatusMsg({ text, kind });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setStatusMsg((curr) => (curr?.text === text ? null : curr));
      }, 4500);
    }
  }

  async function refreshBackups(keepId?: string) {
    const rpc = getRpcClient(props.ctx);
    if (!rpc) {
      setLoading(false);
      flashStatus("No active OpenCode server session found for Backup RPC.", "err");
      return;
    }
    setLoading(true);
    try {
      const useWorkspace = scopeMode() === "workspace" && workspaceDir();
      const res = await rpc.list({
        rootDir: useWorkspace ? workspaceDir() : undefined,
        includeSubprojects: true,
        limit: 500,
      });
      setScanRoot(res.scanRoot || "");
      setWorkspaceDir(res.workspaceDir || "");
      if (res.settings) setSettings(res.settings);
      const nextEntries = Array.isArray(res.entries) ? res.entries : [];
      setAllEntries(nextEntries);
      if (keepId) {
        const idx = filteredEntries().findIndex((e) => e.id === keepId);
        setSelectedIndex(idx >= 0 ? idx : 0);
      } else {
        setSelectedIndex((prev) =>
          Math.min(prev, Math.max(0, filteredEntries().length - 1)),
        );
      }
    } catch (err: any) {
      flashStatus(`Failed to load backups: ${err?.message || String(err)}`, "err");
    } finally {
      setLoading(false);
    }
  }

  const queryTerms = createMemo(() => {
    const q = query().trim().toLowerCase();
    return q ? q.split(/\s+/).filter(Boolean) : [];
  });

  const filteredEntries = createMemo(() => {
    const terms = queryTerms();
    const tf = toolFilter();
    const df = dateFilter();
    const now = Date.now();
    const maxAgeMs =
      df === "24h"
        ? 24 * 60 * 60 * 1000
        : df === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : df === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : 0;

    return allEntries().filter((entry) => {
      if (tf !== "all" && entry.tool !== tf) return false;
      if (maxAgeMs > 0 && now - entry.timeMs > maxAgeMs) return false;
      if (terms.length > 0) {
        const hay = `${entry.relativePath} ${entry.backupPath} ${entry.originalPath} ${entry.root} ${entry.snapshotId} ${entry.slug}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  });

  createEffect(() => {
    const list = filteredEntries();
    if (selectedIndex() >= list.length) {
      setSelectedIndex(Math.max(0, list.length - 1));
    }
  });

  const selectedEntry = createMemo(() => {
    const list = filteredEntries();
    return list[selectedIndex()] || null;
  });

  createEffect(() => {
    const entry = selectedEntry();
    const rpc = getRpcClient(props.ctx);
    if (!entry || !rpc) {
      setDiffState(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    rpc
      .diff({
        backupPath: entry.backupPath,
        originalPath: entry.originalPath,
        maxLines: 220,
      })
      .then((res) => {
        if (!cancelled) {
          setDiffState(res);
          setDiffLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDiffState({
            status: "error",
            summary: `Diff error: ${err?.message || String(err)}`,
            lines: [],
          });
          setDiffLoading(false);
        }
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  function scrollSelectedIntoView(idx: number) {
    const el = rowRefs.get(idx);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }

  function moveSelection(delta: number) {
    const len = filteredEntries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, selectedIndex() + delta));
    setSelectedIndex(next);
    scrollSelectedIntoView(next);
  }

  function cycleToolFilter() {
    const next = TOOL_CYCLE[(TOOL_CYCLE.indexOf(toolFilter()) + 1) % TOOL_CYCLE.length]!;
    setToolFilter(next);
    setSelectedIndex(0);
  }

  function cycleDateFilter() {
    const next = DATE_CYCLE[(DATE_CYCLE.indexOf(dateFilter()) + 1) % DATE_CYCLE.length]!;
    setDateFilter(next);
    setSelectedIndex(0);
  }

  async function updateRetentionDays(nextDays: number) {
    const rpc = getRpcClient(props.ctx);
    if (!rpc) return;
    try {
      const res = await rpc.updateSettings({ retentionDays: nextDays });
      if (res?.settings) setSettings(res.settings);
      const label = nextDays === 0 ? "never auto-prune (0d)" : `${nextDays} days`;
      flashStatus(`Updated backup retention to ${label}`, "ok");
    } catch (err: any) {
      flashStatus(`Failed to update retention: ${err?.message || String(err)}`, "err");
    }
  }

  function cycleRetentionDays() {
    const current = settings().retentionDays;
    const idx = RETENTION_PRESETS.indexOf(current);
    const next =
      idx >= 0
        ? RETENTION_PRESETS[(idx + 1) % RETENTION_PRESETS.length]!
        : RETENTION_PRESETS[0]!;
    void updateRetentionDays(next);
  }

  async function handlePruneNow() {
    const rpc = getRpcClient(props.ctx);
    if (!rpc) return;
    const days = settings().retentionDays;
    if (days <= 0) {
      flashStatus("Retention is set to never (0d); nothing pruned.", "warn");
      return;
    }
    try {
      const useWorkspace = scopeMode() === "workspace" && workspaceDir();
      const res = await rpc.prune({
        rootDir: useWorkspace ? workspaceDir() : scanRoot() || undefined,
        retentionDays: days,
      });
      await refreshBackups(selectedEntry()?.id);
      flashStatus(
        `Pruned ${res.removed} snapshot folder(s) older than ${res.retentionDays}d`,
        "ok",
      );
    } catch (err: any) {
      flashStatus(`Prune failed: ${err?.message || String(err)}`, "err");
    }
  }

  async function executeRestore() {
    const entry = selectedEntry();
    const rpc = getRpcClient(props.ctx);
    if (!entry || !rpc) return;
    setConfirmRestoreModal(false);
    try {
      const res = await rpc.restore({ entry });
      const safetyNote = res.safetySnapshot ? ` (safety backup: ${res.safetySnapshot})` : "";
      await refreshBackups(entry.id);
      flashStatus(`Restored ${entry.relativePath}${safetyNote}`, "ok");
    } catch (err: any) {
      flashStatus(`Restore failed: ${err?.message || String(err)}`, "err");
    }
  }

  async function handleOpenFile(filePath: string, label: string) {
    const rpc = getRpcClient(props.ctx);
    if (!rpc || !filePath) return;
    try {
      const res = await rpc.openFile({ filePath });
      flashStatus(`Opened ${label} via ${res.launcher}`, "ok");
    } catch (err: any) {
      flashStatus(`Open failed: ${err?.message || String(err)}`, "err");
    }
  }

  async function handleOpenDiff() {
    const entry = selectedEntry();
    const rpc = getRpcClient(props.ctx);
    if (!entry || !rpc) return;
    try {
      const res = await rpc.openDiff({
        backupPath: entry.backupPath,
        originalPath: entry.originalPath,
      });
      flashStatus(`Opened diff for ${entry.relativePath} via ${res.launcher}`, "ok");
    } catch (err: any) {
      flashStatus(`Open diff failed: ${err?.message || String(err)}`, "err");
    }
  }

  const activeFilterCount = createMemo(() => {
    let count = 0;
    if (toolFilter() !== "all") count++;
    if (dateFilter() !== "all") count++;
    return count;
  });

  const filterMenuItems = createMemo<UiMenuEntry[]>(() => [
    {
      type: "group",
      label: "Tool Filter (^T)",
      items: TOOL_CYCLE.map((tf) => ({
        label: tf === "all" ? "All tools" : `[${tf}]`,
        ...(toolFilter() === tf ? { icon: "check-small" as const } : {}),
        onSelect: () => {
          setToolFilter(tf);
          setSelectedIndex(0);
        },
      })),
    },
    { type: "separator" },
    {
      type: "group",
      label: "Age Filter (^G)",
      items: DATE_CYCLE.map((df) => ({
        label: df === "all" ? "All dates" : `Last ${df}`,
        ...(dateFilter() === df ? { icon: "check-small" as const } : {}),
        onSelect: () => {
          setDateFilter(df);
          setSelectedIndex(0);
        },
      })),
    },
    { type: "separator" },
    {
      type: "group",
      label: "Auto-Prune Retention (^R)",
      items: RETENTION_PRESETS.map((days) => ({
        label: days === 0 ? "Never auto-prune (0d)" : `${days} days`,
        ...(settings().retentionDays === days ? { icon: "check-small" as const } : {}),
        onSelect: () => {
          void updateRetentionDays(days);
        },
      })),
    },
    { type: "separator" },
    {
      label: "Reset tool & date filters",
      icon: "reset",
      disabled: activeFilterCount() === 0,
      onSelect: () => {
        setToolFilter("all");
        setDateFilter("all");
        setSelectedIndex(0);
      },
    },
  ]);

  function handleKeyDown(e: KeyboardEvent) {
    if (confirmRestoreModal()) {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmRestoreModal(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void executeRestore();
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        cycleToolFilter();
        return;
      }
      if (k === "g") {
        e.preventDefault();
        cycleDateFilter();
        return;
      }
      if (k === "r") {
        e.preventDefault();
        cycleRetentionDays();
        return;
      }
      if (k === "d") {
        e.preventDefault();
        void handlePruneNow();
        return;
      }
      if (k === "o") {
        e.preventDefault();
        const entry = selectedEntry();
        if (entry) void handleOpenFile(entry.backupPath, entry.relativePath);
        return;
      }
      if (k === "e") {
        e.preventDefault();
        void handleOpenDiff();
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      moveSelection(8);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      moveSelection(-8);
    } else if (e.key === "Enter" && selectedEntry()) {
      e.preventDefault();
      setConfirmRestoreModal(true);
    }
  }

  onMount(() => {
    void refreshBackups();
    if (typeof window !== "undefined") {
      window.setTimeout(() => searchInputRef?.focus(), 40);
    }
  });

  const canSwitchScope = createMemo(() => {
    const sr = scanRoot().replace(/\\/g, "/").toLowerCase();
    const wd = workspaceDir().replace(/\\/g, "/").toLowerCase();
    return Boolean(sr && wd && sr !== wd);
  });

  return (
    <div
      class={`oc-lb-root ${props.surface === "panel" ? "oc-lb-root-panel" : "oc-lb-root-modal"}`}
      data-scheme={colorScheme()}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div class="oc-lb-toolbar">
        <div class="oc-lb-search-row">
          <div class="oc-lb-search-box">
            <span class="oc-lb-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              ref={searchInputRef}
              type="text"
              class="oc-lb-search-input"
              placeholder="Filter backups by file path, project, snapshot ID, or slug..."
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setSelectedIndex(0);
              }}
            />
            <Show when={query().length > 0}>
              <button
                type="button"
                class="oc-lb-search-clear"
                title="Clear search"
                onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                  searchInputRef?.focus();
                }}
              >
                ×
              </button>
            </Show>
          </div>

          <Show when={canSwitchScope()}>
            <div class="oc-lb-scope-seg" role="group" aria-label="Scan scope">
              <button
                type="button"
                class={`oc-lb-scope-btn ${scopeMode() === "scan-root" ? "is-active" : ""}`}
                title={`Scan configured root: ${scanRoot()}`}
                onClick={() => {
                  setScopeMode("scan-root");
                  void refreshBackups();
                }}
              >
                All Root
              </button>
              <button
                type="button"
                class={`oc-lb-scope-btn ${scopeMode() === "workspace" ? "is-active" : ""}`}
                title={`Scan current workspace only: ${workspaceDir()}`}
                onClick={() => {
                  setScopeMode("workspace");
                  void refreshBackups();
                }}
              >
                Workspace
              </button>
            </div>
          </Show>

          <ui.Menu
            label={activeFilterCount() > 0 ? `Filters (${activeFilterCount()})` : "Filters"}
            trigger="button"
            icon="sliders"
            placement="bottom-end"
            items={filterMenuItems()}
          />

          <ui.Button
            variant="ghost"
            size="small"
            onClick={() => cycleRetentionDays()}
          >
            Retain: {settings().retentionDays === 0 ? "never" : `${settings().retentionDays}d`}
          </ui.Button>

          <ui.Button
            variant="ghost"
            size="small"
            onClick={() => void handlePruneNow()}
          >
            Prune
          </ui.Button>

          <ui.Button
            variant="ghost"
            size="small"
            onClick={() => void refreshBackups(selectedEntry()?.id)}
          >
            Refresh
          </ui.Button>
        </div>

        <div class="oc-lb-active-chips">
          <Show when={toolFilter() !== "all"}>
            <button
              type="button"
              class="oc-lb-filter-chip"
              onClick={() => setToolFilter("all")}
              title="Click to clear tool filter"
            >
              <span>tool: {toolFilter()}</span>
              <span class="oc-lb-filter-chip-x">×</span>
            </button>
          </Show>
          <Show when={dateFilter() !== "all"}>
            <button
              type="button"
              class="oc-lb-filter-chip"
              onClick={() => setDateFilter("all")}
              title="Click to clear age filter"
            >
              <span>age: {dateFilter()}</span>
              <span class="oc-lb-filter-chip-x">×</span>
            </button>
          </Show>
          <span class="oc-lb-count-summary">
            {filteredEntries().length}/{allEntries().length} snapshots • Root:{" "}
            {scopeMode() === "workspace" && workspaceDir()
              ? workspaceDir()
              : scanRoot() || workspaceDir() || "workspace"}
          </span>
        </div>
      </div>

      <Show when={statusMsg()}>
        {(msg) => (
          <div class={`oc-lb-status oc-lb-status-${msg().kind}`}>{msg().text}</div>
        )}
      </Show>

      <div class="oc-lb-split">
        <div class="oc-lb-list-pane">
          <div class="oc-lb-pane-header">
            <span>SNAPSHOTS ({filteredEntries().length})</span>
            <span>↑↓ Navigate</span>
          </div>
          <div class="oc-lb-list-scroll">
            <Show
              when={!loading()}
              fallback={<div class="oc-lb-empty">Scanning .backups folders...</div>}
            >
              <Show
                when={filteredEntries().length > 0}
                fallback={
                  <div class="oc-lb-empty">
                    {allEntries().length === 0
                      ? "No backups found yet. Automatic snapshots are created before edit, write, patch, apply_patch, and multiedit tool calls."
                      : "No backups match your current search or filter criteria."}
                  </div>
                }
              >
                <For each={filteredEntries()}>
                  {(entry, idx) => {
                    const isSelected = () => idx() === selectedIndex();
                    const relBackup = () => getBackupDisplayPath(entry.backupPath);
                    return (
                      <div
                        ref={(el) => rowRefs.set(idx(), el)}
                        class={`oc-lb-row ${isSelected() ? "is-selected" : ""}`}
                        onClick={() => setSelectedIndex(idx())}
                        onDblClick={() => {
                          setSelectedIndex(idx());
                          setConfirmRestoreModal(true);
                        }}
                      >
                        <div class="oc-lb-row-top">
                          <span class="oc-lb-row-title" title={entry.relativePath}>
                            <HighlightedText
                              text={entry.relativePath}
                              terms={queryTerms()}
                            />
                          </span>
                          <span class={`oc-lb-badge oc-lb-badge-${entry.tool}`}>
                            {entry.tool}
                          </span>
                          <span class="oc-lb-row-age">{formatAge(entry.timeMs)}</span>
                        </div>
                        <div class="oc-lb-row-sub" title={entry.backupPath}>
                          ↳{" "}
                          <HighlightedText
                            text={relBackup()}
                            terms={queryTerms()}
                          />
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>
        </div>

        <div class="oc-lb-preview-pane">
          <div class="oc-lb-pane-header">
            <span>SNAPSHOT DETAILS & UNIFIED DIFF</span>
            <Show when={selectedEntry()}>
              {(entry) => <span>{formatBytes(entry().size)}</span>}
            </Show>
          </div>

          <Show
            when={selectedEntry()}
            fallback={
              <div class="oc-lb-empty">
                Select a backup snapshot on the left to inspect its metadata and diff against the current file on disk.
              </div>
            }
          >
            {(entry) => (
              <>
                <div class="oc-lb-meta-card">
                  <div class="oc-lb-meta-title-row">
                    <div>
                      <div class="oc-lb-meta-filename">
                        <HighlightedText
                          text={entry().relativePath}
                          terms={queryTerms()}
                        />
                      </div>
                      <div class="oc-lb-meta-sub">
                        {formatDateTime(entry().timeMs)} ({formatAge(entry().timeMs)}) •{" "}
                        {formatBytes(entry().size)} • [{entry().tool}] •{" "}
                        <HighlightedText
                          text={entry().snapshotId}
                          terms={queryTerms()}
                        />
                      </div>
                    </div>
                    <div class="oc-lb-action-bar">
                      <ui.Button
                        variant="contrast"
                        size="small"
                        onClick={() => setConfirmRestoreModal(true)}
                      >
                        Restore File
                      </ui.Button>
                      <ui.Button
                        variant="neutral"
                        size="small"
                        onClick={() =>
                          void handleOpenFile(entry().backupPath, entry().relativePath)
                        }
                      >
                        Open Backup
                      </ui.Button>
                      <ui.Button
                        variant="neutral"
                        size="small"
                        onClick={() => void handleOpenDiff()}
                      >
                        Diff in Editor
                      </ui.Button>
                    </div>
                  </div>

                  <div class="oc-lb-meta-grid">
                    <span class="oc-lb-meta-label">Original:</span>
                    <span class="oc-lb-meta-val" title={entry().originalPath}>
                      <HighlightedText
                        text={entry().originalPath}
                        terms={queryTerms()}
                      />
                    </span>
                    <span class="oc-lb-meta-label">Backup:</span>
                    <span class="oc-lb-meta-val" title={entry().backupPath}>
                      <HighlightedText
                        text={entry().backupPath}
                        terms={queryTerms()}
                      />
                    </span>
                  </div>
                </div>

                <div class="oc-lb-diff-summary">
                  <Show
                    when={!diffLoading() && diffState()}
                    fallback={<span>Computing unified diff...</span>}
                  >
                    {(d) => (
                      <span class={`oc-lb-diff-status-${d().status}`}>
                        {d().summary}
                      </span>
                    )}
                  </Show>
                </div>

                <div class="oc-lb-diff-scroll">
                  <Show when={!diffLoading() && diffState()}>
                    {(d) => (
                      <Show
                        when={d().lines.length > 0}
                        fallback={
                          <div class="oc-lb-empty">
                            {d().status === "identical"
                              ? "No differences: backup snapshot and current file on disk are byte-for-byte identical."
                              : d().summary}
                          </div>
                        }
                      >
                        <For each={d().lines}>
                          {(line) => {
                            const prefix =
                              line.type === "add"
                                ? "+ "
                                : line.type === "del"
                                  ? "- "
                                  : line.type === "hunk"
                                    ? ""
                                    : "  ";
                            return (
                              <div class={`oc-lb-diff-line oc-lb-diff-${line.type}`}>
                                {prefix}
                                <HighlightedText
                                  text={line.text}
                                  terms={queryTerms()}
                                />
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    )}
                  </Show>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>

      <Show when={confirmRestoreModal() && selectedEntry()}>
        {(entry) => (
          <div
            class="oc-lb-modal-backdrop"
            onClick={() => setConfirmRestoreModal(false)}
          >
            <div
              class="oc-lb-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 class="oc-lb-modal-title">Restore Backup Snapshot?</h3>
              <p class="oc-lb-modal-desc">
                Restoring <strong>{entry().relativePath}</strong> from snapshot{" "}
                <code>{entry().snapshotId}</code> will overwrite the current file on disk. A{" "}
                <code>pre-restore</code> safety backup of the current file will be saved automatically first.
              </p>
              <div class="oc-lb-modal-paths">
                <div>
                  <strong>From Backup:</strong> {entry().backupPath}
                </div>
                <div>
                  <strong>To Original:</strong> {entry().originalPath}
                </div>
              </div>
              <div class="oc-lb-modal-actions">
                <ui.Button
                  variant="ghost"
                  size="small"
                  onClick={() => setConfirmRestoreModal(false)}
                >
                  Cancel (Esc)
                </ui.Button>
                <ui.Button
                  variant="neutral"
                  size="small"
                  onClick={() => {
                    setConfirmRestoreModal(false);
                    void handleOpenDiff();
                  }}
                >
                  Open Diff in Editor
                </ui.Button>
                <ui.Button
                  variant="contrast"
                  size="small"
                  onClick={() => void executeRestore()}
                >
                  Restore File (Enter)
                </ui.Button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

// Module-level signals so commands/slots can drive the shared panel's query
// without re-mounting BackupManagerView (one persistent side panel, no modals).
const [ocLbPanelQuery, setOcLbPanelQuery] = createSignal("");
let backupFallbackDialog: { close(): void } | undefined;

function openBackupPanel(ctx: PluginContext, initialQuery = "") {
  if (initialQuery) setOcLbPanelQuery(initialQuery);
  const session = ctx.sessions.current();
  if (!session) {
    if (backupFallbackDialog) return;
    const ui = ctx.ui;
    backupFallbackDialog = ctx.dialogs.open((dialog) => {
      onCleanup(() => { backupFallbackDialog = undefined; });
      return (
        <ui.Dialog title="Backup Manager" size="x-large">
          <BackupManagerView ctx={ctx} surface="modal" initialQuery={initialQuery} onClose={dialog.close} />
        </ui.Dialog>
      );
    });
    return;
  }
  backupFallbackDialog?.close();
  try {
    // Always select the tab so it becomes the focused panel even if another
    // panel (usage, search, memory) is already open.
    ctx.layout.open(`${ctx.id}:backups`, session);
  } catch {
    // Layout not ready; retry on next interaction.
  }
}

function createSpriteIcon(iconId: string, className?: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("data-slot", "icon-svg");
  if (className) {
    svg.setAttribute("class", className);
  } else {
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
  }
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const useEl = document.createElementNS(ns, "use");
  useEl.setAttribute("href", `#opencode-v2-icon-${iconId}`);
  svg.appendChild(useEl);
  return svg;
}

export default Plugin.define({
  i18n: {
    en: {
      "backups.command.title": "Browse & Restore File Backups",
      "backups.command.description":
        "Inspect automatic file snapshots, view unified diffs, and restore files",
      "backups.panel": "Backups",
      "backups.panel.toggle": "Toggle Backups Side Panel",
    },
  },
  setup(ctx) {
    const { ui } = ctx;
    const panelTabKey = `${ctx.id}:backups`;
    const backupsTab: PanelTab = {
      id: "backups",
      get title() {
        return ctx.t("backups.panel");
      },
      closable: "compact",
    };

    ctx.add(Style, cssText);

    if (typeof document !== "undefined") {
      document
        .querySelectorAll('[data-action="titlebar-backups"], [data-action="vertical-tabs-backups"]')
        .forEach((el) => el.remove());

      const ensureTitlebarButton = () => {
        if (document.querySelector('[data-action="titlebar-backups"]')) return;
        const searchBtn = document.querySelector<HTMLElement>(
          'header[data-slot="titlebar-v2"] button[aria-label*="Search"]',
        );
        const container = searchBtn?.parentElement;
        if (!container) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-action", "titlebar-backups");
        btn.setAttribute("aria-label", "Backup Snapshots (Ctrl+Shift+B)");
        btn.title = "Backup Snapshots (Ctrl+Shift+B)";
        btn.className = "oc-lb-titlebar-quick-btn";
        btn.appendChild(createSpriteIcon("archive"));
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openBackupPanel(ctx, "");
        });
        container.appendChild(btn);
      };

      const ensureVerticalTabsButton = () => {
        if (document.querySelector('[data-action="vertical-tabs-backups"]')) return;
        const anchorBtn =
          document.querySelector<HTMLElement>('button[data-action="vertical-tabs-usage"]') ??
          document.querySelector<HTMLElement>('button[data-action="vertical-tabs-memories"]') ??
          document.querySelector<HTMLElement>('button[data-action="vertical-tabs-search"]');
        const container = anchorBtn?.parentElement;
        if (!container || !anchorBtn) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-action", "vertical-tabs-backups");
        btn.setAttribute("data-titlebar-tab-action", "");
        btn.setAttribute("aria-label", "Backup Snapshots (Ctrl+Shift+B)");
        btn.title = "Backup Snapshots (Ctrl+Shift+B)";
        btn.className =
          "group flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-4 text-v2-text-text-faint hover:text-v2-text-text-base";

        const iconWrap = document.createElement("span");
        iconWrap.className = "flex size-4 shrink-0 items-center justify-center";
        iconWrap.appendChild(createSpriteIcon("archive", "size-4 shrink-0"));

        const labelSpan = document.createElement("span");
        labelSpan.className = "min-w-0 flex-1 truncate whitespace-nowrap text-start font-[460]";
        labelSpan.textContent = "Backups";

        btn.appendChild(iconWrap);
        btn.appendChild(labelSpan);

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openBackupPanel(ctx, "");
        });
        anchorBtn.insertAdjacentElement("afterend", btn);
      };

      const ensureAllButtons = () => {
        ensureTitlebarButton();
        ensureVerticalTabsButton();
      };

      const handleDocumentClick = (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (!target || typeof target.closest !== "function") return;
        const btn = target.closest(
          '[data-action="titlebar-backups"], [data-action="vertical-tabs-backups"]',
        );
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openBackupPanel(ctx, "");
      };

      const handleGlobalKeydown = (e: KeyboardEvent) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        const key = e.key.toLowerCase();
        if (e.shiftKey && !e.altKey && key === "b") {
          e.preventDefault();
          e.stopPropagation();
          openBackupPanel(ctx, "");
          return;
        }
        if (e.altKey && !e.shiftKey && key === "b") {
          e.preventDefault();
          e.stopPropagation();
          const session = ctx.sessions.current();
          if (session) {
            ctx.layout.toggle(panelTabKey, session);
          } else {
            openBackupPanel(ctx, "");
          }
        }
      };

      ensureAllButtons();
      const observer = new MutationObserver(() => ensureAllButtons());
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("click", handleDocumentClick, true);
      window.addEventListener("keydown", handleGlobalKeydown, true);

      onCleanup(() => {
        observer.disconnect();
        document.removeEventListener("click", handleDocumentClick, true);
        window.removeEventListener("keydown", handleGlobalKeydown, true);
        document
          .querySelectorAll(
            '[data-action="titlebar-backups"], [data-action="vertical-tabs-backups"]',
          )
          .forEach((el) => el.remove());
      });
    }

    ctx.add(Command, () => ({
      id: "backups",
      title: ctx.t("backups.command.title"),
      description: ctx.t("backups.command.description"),
      keywords: "backups backup restore snapshots diff undo",
      group: "Session",
      section: "session",
      bind: "mod+shift+b",
      slash: {
        name: "backups",
        arguments: true,
      },
      featured: true,
      run(input) {
        openBackupPanel(ctx, (input ?? "").trim());
      },
    }));

    ctx.add(Command, () => {
      const session = ctx.sessions.current();
      return {
        id: "backups-panel",
        title: ctx.t("backups.panel.toggle"),
        description: ctx.t("backups.command.description"),
        keywords: "backups panel sidebar snapshots",
        group: "Session",
        section: "session",
        bind: "mod+alt+b",
        run() {
          if (session) {
            ctx.layout.toggle(panelTabKey, session);
          } else {
            openBackupPanel(ctx, "");
          }
        },
      };
    });

    ctx.add(MenuItem, () => {
      const session = ctx.sessions.current();
      const opened = !!session && ctx.layout.state(panelTabKey, session) !== "closed";
      return {
        menu: "session.panel",
        id: "backups",
        title: ctx.t("backups.panel"),
        description: ctx.t("backups.command.description"),
        icon: "archive",
        keybind: `${ctx.id}.backups-panel`,
        opened,
        run() {
          const current = ctx.sessions.current();
          if (current) {
            ctx.layout.toggle(panelTabKey, current);
          } else {
            openBackupPanel(ctx, "");
          }
        },
      };
    });

    ctx.add(Panel, {
      id: "backups",
      region: "side",
      list: (input) => (input.open.includes("backups") ? [backupsTab] : []),
      render: () => <BackupManagerView ctx={ctx} surface="panel" initialQuery="" />,
    });
  },
});
