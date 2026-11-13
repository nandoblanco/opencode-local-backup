import { createRoot } from "solid-js";
import { render } from "solid-js/web";
import plugin from "../gui";
import { Style } from "@opencode/plugin/gui";

// Only the host boundary is stubbed; setup, click handlers and dialog content are real.
const commands = new Map();
let disposeDialog = () => {};
const ui = {
  Dialog: (props: any) => <section role="dialog" aria-label={props.title}><h1>{props.title}</h1>{props.children}{props.footer}</section>,
  Button: (props: any) => <button onClick={props.onClick} disabled={props.disabled}>{props.children}</button>,
  Keybind: (props: any) => <kbd>{props.keys.join("+")}</kbd>,
  Menu: (props: any) => <button>{props.label}</button>,
};
const ctx = {
  id: "opencode-local-backup",
  ui,
  appearance: { mode: () => "dark" },
  sessions: { current: () => undefined },
  servers: { list: () => [], get: () => undefined },
  t: (key: string) => key,
  add(registry: any, value: any) {
    if (registry === Style) {
      const style = document.createElement("style");
      style.textContent = value;
      document.head.append(style);
      return;
    }
    const item = typeof value === "function" ? value() : value;
    if (item?.run) commands.set(item.id, item);
  },
  dialogs: {
    open(view: any) {
      disposeDialog();
      disposeDialog = render(() => view({ close: () => disposeDialog() }), document.getElementById("dialog")!);
    },
  },
};
createRoot(() => plugin.setup!(ctx as any));
(window as any).backupSmoke = { commands, close: () => disposeDialog() };
