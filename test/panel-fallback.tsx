import { createRoot, createSignal, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { Command, Panel, Slot, Style } from "@opencode/plugin/gui";
import backup from "../gui";

const style = document.createElement("style");
style.textContent = 'body{margin:16px;background:#16181d;color:#eee;font:14px system-ui;--v2-text-text-base:#eee;--v2-text-text-weak:#aaa;--v2-text-text-faint:#999;--v2-background-bg-base:#16181d;--v2-background-bg-raised:#20232a;--v2-border-border-base:#454851}dialog{width:min(1100px,calc(100vw - 64px));max-width:100%;box-sizing:border-box;background:#20232a;color:#eee;border:1px solid #555;padding:20px}dialog::backdrop{background:#0009}button,input,select,textarea{font:inherit}button{cursor:pointer}#panel{height:700px;max-width:1100px}';
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
const rpc = {
  dashboard: async () => ({ cards: [{ name: "Test Account", pctLeft: 75, badgeStatus: "good", badge: "75%", primaryValue: "75%" }], updatedAt: "just now" }),
   tokens: async () => ({ sessions: [], sortedProjects: [], topTags: [], totalSessionsMatched: 0, totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 } }),
   summary: async () => ({ local30d: { sessions: 3, turns: 5, billed: 1000, withCache: 2000, models: [] }, localAllTime: { sessions: 7, turns: 12, billed: 3000, withCache: 5000, models: [] } }),
    sessionStatus: async () => ({ sessionId: "test", handoffPct: 92, modelContextLimit: 200000, steps: 5, prompts: 1, liveContextTokens: 184000, tokens: { total: 1000 }, uncachedInputTokens: 1000, uncachedLimitTokens: 15000000, statusReason: "Ctx 184K/200K", approaching: false, overLimit: true }),
   createHandoff: async () => ({ ok: true, handoff: { shortId: "test", count: 5, checkpointPath: "checkpoint.md", directory: "test-project", handoffPrompt: "Continue from the saved checkpoint." } }),
  query: async () => ({ hits: [], topics: [], totalEntries: 0, coreCount: 0, results: [], totalSessions: 0, parsed: { terms: [], fuzzyTerms: [] } }),
  list: async () => ({ entries: [], scanRoot: "", workspaceDir: "" }),
};
const client = { rpc: () => rpc };
const ui = {
  Dialog: (props: any) => <><h1>{props.title}</h1>{props.children}<button onClick={() => closeDialog()}>Close</button></>,
  Button: (props: any) => <button onClick={props.onClick} disabled={props.disabled}>{props.children}</button>,
  Keybind: (props: any) => <kbd>{props.keys.join("+")}</kbd>,
  Menu: (props: any) => <button>{props.label}</button>,
  Icon: () => <span aria-hidden="true" />,
  IconButton: (props: any) => <button aria-label={props.label} onClick={props.onClick} disabled={props.disabled}>{props.label}</button>,
  Loader: () => <span role="progressbar" aria-label="Loading" />,
  TextInput: (props: any) => <label>{props.label}<input value={props.value} placeholder={props.placeholder} onInput={event => props.onInput(event.currentTarget.value)} /></label>,
  Tooltip: (props: any) => <>{props.children}</>,
};
const app = document.getElementById("app")!;
app.insertAdjacentHTML("beforeend", '<header data-slot="titlebar-v2"><div><button aria-label="Search">Search</button></div></header><nav id="actions"></nav><div id="panel"></div>');
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
  activate: () => setSession({ id: "test", directory: "", server: { id: "test", client } }),
  blank: () => { disposePanel(); setSession(undefined); },
};
