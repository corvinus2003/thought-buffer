import { app, BrowserWindow, dialog, Menu, protocol, session, shell } from 'electron';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { APP_URL, createDesktopHandler, isAppUrl, isExternalUrl } from './protocol.mjs';

app.setName('Thought Buffer');
app.setPath('userData', join(app.getPath('appData'), 'Thought Buffer'));
const smoke = process.argv.includes('--smoke-test');
let smokeDirectory;
if (smoke) {
  smokeDirectory = await mkdtemp(join(tmpdir(), 'thought-buffer-desktop-test-'));
  app.setPath('userData', smokeDirectory);
}
protocol.registerSchemesAsPrivileged([{ scheme: 'thought-buffer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    const directory = join(app.getPath('userData'), 'data');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const handler = createDesktopHandler({ assets: join(app.getAppPath(), 'renderer'), directory });
    protocol.handle('thought-buffer', handler);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Thought Buffer', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
    const createWindow = async () => {
      window = new BrowserWindow({ title: 'Thought Buffer', width: 1320, height: 900, minWidth: 760, minHeight: 580, backgroundColor: '#f4f6fa', show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: true } });
      window.webContents.setWindowOpenHandler(({ url }) => { if (isExternalUrl(url)) void shell.openExternal(url); return { action: 'deny' }; });
      window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.webContents.on('will-prevent-unload', (event) => {
        const choice = dialog.showMessageBoxSync(window, { type: 'warning', buttons: ['Keep open', 'Close anyway'], defaultId: 0, cancelId: 0, message: 'Some changes are still waiting to save.', detail: 'Keep Thought Buffer open to finish saving.' });
        if (choice === 1) event.preventDefault();
      });
      window.on('closed', () => { window = null; });
      await window.loadURL(APP_URL);
      if (!smoke) window.show();
      return window;
    };
    await createWindow();
    app.on('activate', () => { if (!window) void createWindow(); });
    if (smoke) {
      const { runSmokeTest } = await import('./smoke.mjs');
      await runSmokeTest(window, directory);
      console.log('DESKTOP_SMOKE_OK');
      window.destroy();
      await rm(smokeDirectory, { recursive: true, force: true });
      app.exit(0);
    }
  }).catch(async (error) => {
    if (smoke) { console.error('DESKTOP_SMOKE_FAILED', error); if (smokeDirectory) await rm(smokeDirectory, { recursive: true, force: true }); app.exit(1); }
    else { dialog.showErrorBox('Thought Buffer could not open', 'Your saved thoughts have not been replaced. Try reopening the app.'); app.quit(); }
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
