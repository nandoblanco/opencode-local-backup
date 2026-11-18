import { createRoot, createSignal, For, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { Command, Panel, Slot, Style } from "@opencode/plugin/gui";
import backup from "../gui";

const style = document.createElement("style");
style.textContent = 'body{margin:16px;background:#16181d;color:#eee;font:14px system-ui;--v2-text-text-base:#eee;--v2-text-text-weak:#aaa;--v2-text-text-faint:#999;--v2-background-bg-base:#16181d;--v2-background-bg-raised:#20232a;--v2-border-border-base:#454851}dialog{width:min(1100px,calc(100vw - 64px));max-width:100%;box-sizing:border-box;background:#20232a;color:#eee;border:1px solid #555;padding:20px}dialog::backdrop{background:#0009}button,input,select,textarea,summary{font:inherit;color:inherit}button,summary{cursor:pointer}#panel{height:760px;max-width:1100px}#sidebar{display:flex;flex-direction:column;gap:4px;width:210px;padding:10px;background:#111317;border:1px solid #2b2f3a;border-radius:8px;margin-bottom:12px}#sidebar button{display:flex;align-items:center;gap:10px;background:transparent;border:none;color:#ccc;padding:6px 10px;border-radius:6px;text-align:left}#sidebar button:hover{background:#1f232b;color:#fff}details{position:relative}details [role=menu]{position:absolute;right:0;top:calc(100% + 4px);z-index:50;background:#20232a;border:1px solid #454851;border-radius:6px;padding:4px;min-width:180px;display:flex;flex-direction:column;gap:2px}details [role=menuitem]{background:transparent;border:none;padding:6px 10px;text-align:left;border-radius:4px}details [role=menuitem]:hover{background:#2d323e}';
document.head.append(style);
const commands = new Map<string, any>();
const panels = new Map<string, any>();
const headerSlots: any[] = [];
const calls: string[] = [];
const drafts: any[] = [];
const copies: string[] = [];
const toasts: any[] = [];
const [session, setSession] = createSignal<any>();
let closeDialog = () => {};
let disposePanel = () => {};
let searchDelayMs = 0;

const mockSessions = [
  {
    id: "ses_alpha1111",
    shortId: "alpha111",
    smartTitle: "Interactive session search plugin",
    rawTitle: "Interactive session search plugin",
    project: "opencode-plugins",
    tags: ["search", "playwright", "ui"],
    customTags: ["ui"],
    liked: true,
    note: "",
    models: ["dlabs/gemini-4-argon"],
    modelBreakdown: {
      "dlabs/gemini-4-argon": { input: 14000, output: 4200, reasoning: 0, cacheRead: 180000, cacheWrite: 12000, turns: 8, total: 210200 },
    },
    tokens: { input: 14000, output: 4200, reasoning: 0, cacheRead: 180000, cacheWrite: 12000, total: 210200 },
    turns: 8,
    totalSessionTurns: 8,
    steps: 8,
    toolCalls: 14,
    turnScoped: false,
    score: 12,
    timeCreated: 1760000000000,
    timeUpdated: 1761400000000,
  },
  {
    id: "ses_beta2222",
    shortId: "beta2222",
    smartTitle: "Automating four AI provider usage checks",
    rawTitle: "Automating four AI provider usage checks",
    project: "cms",
    tags: ["usage", "playwright"],
    customTags: [],
    liked: false,
    note: "",
    models: ["anthropic/claude-sonnet-4-5"],
    modelBreakdown: {
      "anthropic/claude-sonnet-4-5": { input: 9500, output: 3100, reasoning: 0, cacheRead: 92000, cacheWrite: 8000, turns: 5, total: 112600 },
    },
    tokens: { input: 9500, output: 3100, reasoning: 0, cacheRead: 92000, cacheWrite: 8000, total: 112600 },
    turns: 5,
    totalSessionTurns: 5,
    steps: 5,
    toolCalls: 9,
    turnScoped: false,
    score: 8,
    timeCreated: 1761000000000,
    timeUpdated: 1761200000000,
  },
];

function computeTopTags(rows: typeof mockSessions) {
  const map: Record<string, { count: number; billed: number; total: number; steps: number; input: number; output: number; cacheRead: number }> = {};
  for (const s of rows) {
    const billed = s.tokens.input + s.tokens.output + s.tokens.cacheWrite;
    for (const t of s.tags) {
      if (!map[t]) map[t] = { count: 0, billed: 0, total: 0, steps: 0, input: 0, output: 0, cacheRead: 0 };
      map[t].count += 1;
      map[t].billed += billed;
      map[t].total += s.tokens.total;
      map[t].steps += s.steps;
      map[t].input += s.tokens.input;
      map[t].output += s.tokens.output;
      map[t].cacheRead += s.tokens.cacheRead;
    }
  }
  return Object.entries(map).sort((a, b) => b[1].billed - a[1].billed);
}

const rpc = {
  dashboard: async (input?: any) => {
    const tf = input?.timeframe || "30d";
    const mult = tf === "today" ? 0.1 : tf === "7d" ? 0.4 : tf === "all" ? 2.5 : tf === "range" ? 0.75 : 1;
    return {
      timeframe: tf,
      startDate: input?.startDate,
      endDate: input?.endDate,
      cards: [
        {
          id: "dlab1",
          name: "DLab 1",
          type: "dlab1",
          badge: "75% left",
          badgeStatus: "good",
          pctLeft: 75,
          pctUsed: 25,
          primaryLabel: "Remaining Credits",
          primaryValue: "$30.00",
          secondaryValue: "$10.00 used of $40.00",
          allowancePeriodLabel: "Weekly Allowance",
          rows: [
            { label: "Total Allowance", value: "$40.00" },
            { label: "Credits Used", value: "$10.00 (25.0%)" },
            { label: "Resets In", value: "3d 2h (Oct 29)" },
          ],
        },
        {
          id: "dlab2",
          name: "DLab 2",
          type: "dlab2",
          badge: "86% left",
          badgeStatus: "good",
          pctLeft: 86,
          pctUsed: 14,
          primaryLabel: "Remaining Tokens",
          primaryValue: "857.2M",
          secondaryValue: "142.8M used of 1.0B",
          allowancePeriodLabel: "All-Time Token Cap",
          rows: [
            { label: "Token Limit", value: "1,000,000,000 (1B)" },
            { label: "All-Time Used", value: "142.8M (14.3%)" },
            { label: "Total Requests", value: "2,188" },
          ],
        },
      ],
      models: [
        {
          provider: "DLab 1",
          model: "claude-opus-4-7",
          requests: Math.round(140 * mult),
          inputTokens: Math.round(420000 * mult),
          outputTokens: Math.round(95000 * mult),
          cacheTokens: Math.round(6800000 * mult),
          totalTokens: Math.round(7315000 * mult),
          costLabel: `$${(12.71 * mult).toFixed(2)}`,
        },
        {
          provider: "DLab 2",
          model: "gemini-4-argon",
          requests: Math.round(310 * mult),
          inputTokens: Math.round(890000 * mult),
          outputTokens: Math.round(210000 * mult),
          cacheTokens: Math.round(14500000 * mult),
          totalTokens: Math.round(15600000 * mult),
          costLabel: `${Math.round(12500 * mult).toLocaleString()} cr`,
        },
      ],
      updatedAt: "just now",
    };
  },
  tokens: async (input?: any) => {
    let rows = [...mockSessions];
    if (input?.project) rows = rows.filter(r => r.project === input.project);
    if (input?.tag) rows = rows.filter(r => r.tags.includes(input.tag));
    if (input?.liked) rows = rows.filter(r => r.liked);
    return {
      sessions: rows,
      sortedProjects: [
        ["opencode-plugins", { sessions: 1, turns: 8, billed: 30200, total: 210200 }],
        ["cms", { sessions: 1, turns: 5, billed: 20600, total: 112600 }],
      ],
      topTags: computeTopTags(rows),
      totalSessionsMatched: rows.length,
      totals: { input: 23500, output: 7300, cacheRead: 272000, cacheWrite: 20000, turns: 13 },
    };
  },
  mutateSession: async (input: any) => {
    const target = mockSessions.find(s => s.id.startsWith(input.sessionPrefix) || s.shortId === input.sessionPrefix);
    if (!target) return { ok: false, message: "Not found" };
    if (input.action === "like") target.liked = true;
    if (input.action === "unlike") target.liked = false;
    if (input.action === "tag" && input.value) {
      const added = String(input.value).split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      target.tags = [...new Set([...target.tags, ...added])];
      target.customTags = [...new Set([...target.customTags, ...added])];
    }
    if (input.action === "untag" && input.value) {
      const rem = new Set(String(input.value).split(",").map(t => t.trim().toLowerCase()).filter(Boolean));
      target.tags = target.tags.filter(t => !rem.has(t));
      target.customTags = target.customTags.filter(t => !rem.has(t));
    }
    return { ok: true, message: "Updated", entry: { customTags: target.customTags, liked: target.liked } };
  },
  summary: async () => ({ local30d: { sessions: 3, turns: 5, billed: 1000, withCache: 2000, models: [] }, localAllTime: { sessions: 7, turns: 12, billed: 3000, withCache: 5000, models: [] } }),
  sessionStatus: async () => ({ sessionId: "test", handoffPct: 92, modelContextLimit: 200000, steps: 5, prompts: 1, liveContextTokens: 184000, tokens: { total: 1000 }, uncachedInputTokens: 1000, uncachedLimitTokens: 15000000, statusReason: "Ctx 184K/200K", approaching: false, overLimit: true }),
  createHandoff: async () => ({ ok: true, handoff: { shortId: "test", count: 5, checkpointPath: "checkpoint.md", directory: "test-project", handoffPrompt: "Continue from the saved checkpoint." } }),
  query: async () => {
    if (searchDelayMs > 0) await new Promise(r => setTimeout(r, searchDelayMs));
    return { hits: [], topics: [], totalEntries: 0, coreCount: 0, results: [], totalSessions: 0, parsed: { terms: [], fuzzyTerms: [] } };
  },
  list: async () => ({ entries: [], scanRoot: "", workspaceDir: "" }),
};
const client = { rpc: () => rpc };
const ui = {
  Dialog: (props: any) => <><h1>{props.title}</h1>{props.children}<button onClick={() => closeDialog()}>Close</button></>,
  Button: (props: any) => <button onClick={props.onClick} disabled={props.disabled}>{props.children}</button>,
  Keybind: (props: any) => <kbd>{props.keys.join("+")}</kbd>,
  Menu: (props: any) => <details><summary>{props.label}</summary><div role="menu"><For each={props.items || []}>{(item: any) => <button role="menuitem" onClick={e => { const d = e.currentTarget.closest("details"); if (d) d.open = false; item.onSelect?.(); }}>{item.label}</button>}</For></div></details>,
  Icon: () => <span aria-hidden="true" />,
  IconButton: (props: any) => <button aria-label={props.label} onClick={props.onClick} disabled={props.disabled}>{props.label}</button>,
  Loader: () => <span role="progressbar" aria-label="Loading" />,
  TextInput: (props: any) => <label>{props.label}<input value={props.value} placeholder={props.placeholder} onInput={event => props.onInput(event.currentTarget.value)} /></label>,
  Tooltip: (props: any) => <>{props.children}</>,
};
const app = document.getElementById("app")!;
app.insertAdjacentHTML(
  "beforeend",
  '<style>#sidebar button{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:#a1a1aa;font-size:13px;line-height:16px;text-align:left;white-space:nowrap;cursor:pointer}#sidebar button svg{width:16px;height:16px;flex-shrink:0}</style><header data-slot="titlebar-v2"><div><button aria-label="Search">Search</button></div></header><aside id="sidebar" style="display:flex;flex-direction:column;gap:4px;width:220px;padding:12px;background:#121216;color:#d4d4d8;"><button type="button" data-action="vertical-tabs-search"><div class="size-4 shrink-0 flex items-center justify-center"><svg data-slot="icon-svg" class="size-full" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><span class="min-w-0 truncate">Search sessions</span><span class="ms-auto"><kbd>Ctrl+K</kbd></span></button></aside><nav id="actions"></nav><div id="panel"></div>',
);
const plugins: Record<string, any> = { backup };
if (new URLSearchParams(location.search).has("suite")) {
  const siblings = import.meta.glob("../../opencode-local-*/{gui,src/gui}.tsx");
  for (const name of ["usage", "tokens", "search", "memory"]) {
    const source = `../../opencode-local-${name}/${name === "memory" ? "gui.tsx" : "src/gui.tsx"}`;
    plugins[name] = (await siblings[source]() as any).default;
  }
}
for (const [name, plugin] of Object.entries(plugins)) {
  const ctx: any = {
    id: name, ui, client, system: { copy: async (text: string) => { copies.push(text); } }, appearance: { mode: () => "dark" },
    sessions: { current: session }, servers: { list: () => [], get: () => undefined },
    t: (key: string) => key, toast: { show: (value: any) => { toasts.push(value); if (value.actions) for (const action of value.actions) { const button = document.createElement("button"); button.textContent = action.label; button.onclick = () => action.run(); document.getElementById("actions")!.append(button); } else if (value.variant === "error") throw new Error(value.title); } },
    layout: {
      draft: (value: any) => drafts.push(value),
      state: () => "closed",
      open: (key: string) => {
        calls.push(key);
        disposePanel();
        disposePanel = render(() => panels.get(name).render({ session: session() }), document.getElementById("panel")!);
      },
      toggle: (key: string) => ctx.layout.open(key),
    },
    add(registry: any, value: any) {
      const item = typeof value === "function" ? value() : value;
      if (registry === Style) { const el = document.createElement("style"); el.textContent = item; document.head.append(el); }
      if (registry === Command) commands.set(`${name}:${item.id}`, item);
       if (registry === Panel) panels.set(name, item);
       if (registry === Slot && item.at === "session.header") headerSlots.push(item);
    },
    dialogs: {
      open(view: any) {
        const invoker = document.activeElement as HTMLElement;
        const el = document.createElement("dialog");
        document.body.append(el);
        const handle = { close: () => { el.close(); dispose(); el.remove(); invoker?.focus(); } };
        const dispose = render(() => view(handle), el);
        el.addEventListener("cancel", event => { event.preventDefault(); handle.close(); });
        closeDialog = handle.close;
        el.showModal();
        return handle;
      },
    },
  };
  createRoot(() => plugin.setup!(ctx));
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => commands.get(`${name}:${name === "backup" ? "backups" : name}`).run();
  document.getElementById("actions")!.append(button);
}
const header = document.createElement("div");
header.id = "session-header";
document.getElementById("actions")!.after(header);
render(() => headerSlots.map(slot => slot.render()), header);
(window as any).fallbackTest = {
   commands, calls, drafts, copies, toasts,
  setSearchDelay: (ms: number) => { searchDelayMs = ms; },
  activate: () => setSession({ id: "test", directory: "", server: { id: "test", client } }),
  blank: () => { disposePanel(); setSession(undefined); },
};
