"use strict";

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import solid from "vite-plugin-solid";
import { chromium } from "playwright";

const suite = process.argv.includes("--suite");
const server = await createServer({ configFile: false, plugins: [solid()], resolve: { dedupe: ["solid-js", "@opencode/plugin"] }, server: { host: "127.0.0.1", port: 5198, strictPort: true, fs: { allow: [".."] } } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.goto(`http://127.0.0.1:5198/test/panel-fallback.html${suite ? "?suite" : ""}`);
  await page.waitForFunction(() => window.fallbackTest);
  await page.evaluate(() => window.fallbackTest.activate());
  if (suite) {
  await page.locator("#session-header").getByText("75%", { exact: true }).waitFor();
  assert.equal(await page.locator("#session-header").getByText("Context", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Save & Copy Handoff", exact: true }).count(), 0);
   await page.evaluate(() => window.fallbackTest.commands.get("tokens:handoff").run());
  await page.waitForFunction(() => window.fallbackTest.copies.length === 1);
  assert.equal(await page.evaluate(() => window.fallbackTest.drafts.length), 0);
  assert.equal(await page.evaluate(() => window.fallbackTest.copies[0]), "Continue from the saved checkpoint.");
  await page.evaluate(() => { window.fallbackTest.copies.length = 0; });
  assert.equal(await page.locator("#session-header button[aria-label]").count(), 0, "header has percentage badges only, no shortcut icons");
  await mkdir(".screenshots", { recursive: true });
  await page.screenshot({ path: ".screenshots/session-header-percentages-1280.png" });
  }
  await mkdir(".screenshots", { recursive: true });
  for (const name of suite ? ["usage", "tokens", "search", "memory", "backup"] : ["backup"]) {
    await page.evaluate(() => window.fallbackTest.blank());
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator("dialog").waitFor();
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'));
    await page.evaluate(name => window.fallbackTest.commands.get(`${name}:${name === "backup" ? "backups" : name}`).run(), name);
    assert.equal(await page.locator("dialog").count(), 1, `${name}: repeated open does not stack`);
    if (name === "usage") {
      assert.equal(await page.getByText("Token Explorer", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "30 Days", exact: true }).count(), 0);
    }
    if (name === "tokens") {
      await page.getByText("1.0K", { exact: true }).waitFor();
      await page.getByRole("button", { name: "All-Time", exact: true }).click();
      await page.getByText("3.0K", { exact: true }).waitFor();
      await page.getByRole("button", { name: "30 Days", exact: true }).click();
      await page.getByPlaceholder("Search topics or filter: project:cms model:claude #playwright * ...").fill("project:cms");
      await page.getByRole("button", { name: "★ Liked", exact: true }).click();
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      assert.equal(await page.locator(".olu-provider-card").count(), 0);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.screenshots/${name}-fallback-1280.png` });
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator("dialog").waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(() => window.fallbackTest.activate());
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal(await page.locator("dialog").count(), 0, `${name}: active session uses panel`);
    assert.ok(await page.evaluate(name => window.fallbackTest.calls.some(key => key.startsWith(`${name}:`)), name));
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'));
    await page.screenshot({ path: `.screenshots/${name}-panel-1280.png` });
  }
  if (suite) {
   await page.evaluate(() => window.fallbackTest.commands.get("tokens:handoff").run());
  await page.waitForFunction(() => window.fallbackTest.copies.length === 1);
  assert.equal(await page.evaluate(() => window.fallbackTest.copies[0]), "Continue from the saved checkpoint.");
  assert.equal(await page.evaluate(() => window.fallbackTest.drafts.length), 0);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${suite ? "all five plugins" : "standalone backup"}: duplicate-open guards, Escape, close/reopen, active-session panels, console and page overflow`);
} finally {
  await browser.close();
  await server.close();
}
