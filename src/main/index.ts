import { app, BrowserWindow } from "electron";
import { join } from "node:path";

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
  createWindow();
  app.on("window-all-closed", () => app.quit());
}

void main();
