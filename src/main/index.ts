import { app, BrowserWindow, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { createAdapters } from "./cli/registry";
import { registerIpc } from "./ipc";
import { createStore } from "./store";
import { createTurnRunner } from "./turn";

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0e0e0f",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  // block all navigation, except reloads of the dev server page while developing
  win.webContents.on("will-navigate", (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

async function main(): Promise<void> {
  await app.whenReady();
  const dataDir = process.env.LEARN_DATA_DIR ?? app.getPath("userData");
  const store = await createStore(dataDir, fsp);
  const adapters = createAdapters({
    spawn,
    env: process.env,
    home: os.homedir(),
    tmpRoot: os.tmpdir(),
    fs,
  });
  let win: BrowserWindow | null = null;
  const send = (channel: string, ...args: unknown[]): void => {
    win?.webContents.send(channel, ...args);
  };
  const now = (): string => new Date().toISOString();
  const newId = (prefix: "s" | "k"): string => prefix + "_" + randomUUID();
  const turns = createTurnRunner({
    adapters,
    store,
    now,
    newId,
    notify: (s) => send("session:updated", s),
  });
  registerIpc({ ipcMain, adapters, store, turns, now, newId, send });
  if (!process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:",
          ],
        },
      });
    });
  }
  win = createWindow();
  app.on("window-all-closed", () => app.quit());
}

void main();
