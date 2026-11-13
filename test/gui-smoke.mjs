"use strict";

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import solid from "vite-plugin-solid";
import { chromium } from "playwright";

const server = await createServer({ configFile: false, plugins: [solid()], server: { host: "127.0.0.1", port: 5198, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.goto("http://127.0.0.1:5198/test/gui-smoke.html");
  await page.locator('[data-action="titlebar-backups"]').click();
  await page.waitForTimeout(150);
  console.log("Render errors:", errors);
  assert.equal(await page.locator(".oc-lb-root-modal").count(), 1, "Click must mount the backup manager");
  await page.evaluate(() => window.backupSmoke.close());
  await page.keyboard.press("Control+Shift+B");
  assert.equal(await page.locator(".oc-lb-root-modal").count(), 1, "Shortcut must mount the backup manager");
  await page.getByText("No active OpenCode server session found for Backup RPC.", { exact: true }).waitFor();
  assert.deepEqual(errors, [], "No render or console errors");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow");
  await mkdir(".screenshots", { recursive: true });
  await page.screenshot({ path: ".screenshots/backup-dialog-1280.png", fullPage: true });
  console.log("PASS: disconnected-server state, icon click, Ctrl+Shift+B, render, console and overflow checks");
} finally {
  await browser.close();
  await server.close();
}
