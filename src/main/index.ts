import { app, BrowserWindow, dialog, ipcMain, safeStorage, session } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { FILE_LIST_MAX } from "../shared/limits";
import { createAdapters } from "./cli/registry";
import { registerIpc } from "./ipc";
import { listFolder } from "./files";
import { WebSocket } from "ws";
import { createSecrets } from "./secrets";
import { createStore } from "./store";
import { createSubjectRunner } from "./subjectTurn";
import { createTurnRunner } from "./turn";
import { createListener, speak } from "./voice/deepgram";
import { createVoiceHub } from "./voice/hub";

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
  const newId = (prefix: "s" | "k" | "u"): string => prefix + "_" + randomUUID();
  const turns = createTurnRunner({
    adapters,
    store,
    now,
    newId,
    notify: (s) => send("session:updated", s),
    listFolder: (f) => listFolder(fsp, f, FILE_LIST_MAX),
  });
  const subjects = createSubjectRunner({
    adapters,
    store,
    listFolder: (f) => listFolder(fsp, f, FILE_LIST_MAX),
    now,
    notify: (s) => send("subject:updated", s),
  });
  const dialogs = {
    pickFolder: async (): Promise<string | null> => {
      const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
    },
    pickFiles: async (): Promise<string[]> => {
      const r = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
      return r.canceled ? [] : r.filePaths;
    },
  };
  const secrets = createSecrets({ safeStorage, fs: fsp, file: join(dataDir, "deepgram.key") });
  const voice = createVoiceHub({
    secrets,
    settings: () => store.readSettings(),
    listen: (key, language, on) => createListener({ WebSocket }, key, language, on),
    speak: (key, v, text) => speak({ fetch }, key, v, text),
    send,
  });
  registerIpc({
    ipcMain,
    adapters,
    store,
    turns,
    subjects,
    now,
    newId,
    send,
    dialogs,
    secrets,
    voice,
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        permission === "media" &&
          win !== null &&
          webContents === win.webContents &&
          !(details as { mediaTypes?: string[] }).mediaTypes?.includes("video"),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      permission === "media" &&
      win !== null &&
      webContents === win.webContents &&
      !(details as { mediaTypes?: string[] }).mediaTypes?.includes("video"),
  );
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
