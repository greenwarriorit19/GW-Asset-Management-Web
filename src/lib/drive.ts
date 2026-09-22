// Google Drive integration — uploads attachments into a shared Drive folder from the browser.
// Uses Google Identity Services (OAuth token client) + Drive REST API v3. No server required.

export interface DriveConfig { enabled: boolean; clientId: string; folderId: string; folderName?: string; account?: string }

const CFG_KEY = 'gw-drive-config';
export const DEFAULT_FOLDER_ID = '13xmS11iq4stCGMVhMxKYhemRKZ-jxvxv';   // "Asset proof" (greenwarriorit19@gmail.com)
const SCOPE = 'https://www.googleapis.com/auth/drive';                   // needed to write into a folder the app did not create

export function getDriveConfig(): DriveConfig {
  try { const raw = localStorage.getItem(CFG_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return { enabled: false, clientId: '', folderId: DEFAULT_FOLDER_ID };
}
export function setDriveConfig(c: DriveConfig) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
export const driveEnabled = () => { const c = getDriveConfig(); return c.enabled && !!c.clientId && !!c.folderId; };

// ---------- Google Identity Services ----------
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface Gis { accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } } }
declare global { interface Window { google?: Gis } }

let gisLoading: Promise<void> | undefined;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load Google sign-in script. Check the internet connection.'));
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

let token: { value: string; exp: number } | undefined;
export function signOutDrive() { token = undefined; }

/** Returns a valid access token, prompting the Google sign-in / consent window when needed. */
export async function getAccessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const cfg = getDriveConfig();
  if (!cfg.clientId) throw new Error('Google Drive is not configured. Enter the OAuth Client ID under Master Data → Google Drive.');
  await loadGis();
  return new Promise((res, rej) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId, scope: SCOPE,
      callback: r => {
        if (r.error || !r.access_token) return rej(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'));
        token = { value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 };
        res(r.access_token);
      },
      error_callback: e => rej(new Error(e.message || `Google sign-in failed (${e.type}).`)),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await getAccessToken();
  const r = await fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); msg = j.error?.message ?? msg; } catch { /* ignore */ }
    if (r.status === 401) token = undefined;
    throw new Error(`Google Drive: ${msg}`);
  }
  return r.json() as Promise<T>;
}

export interface DriveFile { id: string; name: string; mimeType: string; size?: string; webViewLink?: string; thumbnailLink?: string }

/** Verifies the configured folder is reachable and writable; returns its name and the signed-in account. */
export async function testDriveConnection(): Promise<{ folderName: string; account: string; canWrite: boolean }> {
  const cfg = getDriveConfig();
  const f = await api<{ name: string; capabilities?: { canAddChildren?: boolean } }>(`https://www.googleapis.com/drive/v3/files/${cfg.folderId}?fields=name,capabilities/canAddChildren&supportsAllDrives=true`);
  const me = await api<{ user: { emailAddress: string } }>('https://www.googleapis.com/drive/v3/about?fields=user/emailAddress');
  return { folderName: f.name, account: me.user.emailAddress, canWrite: !!f.capabilities?.canAddChildren };
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Finds or creates a sub-folder (e.g. one per Asset ID) inside the configured root folder. */
async function ensureSubfolder(name: string): Promise<string> {
  const root = getDriveConfig().folderId;
  const q = `name='${esc(name)}' and '${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await api<{ files: { id: string }[] }>(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files[0]) return found.files[0].id;
  const created = await api<{ id: string }>('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [root] }),
  });
  return created.id;
}

/** Uploads a file to Drive: <root>/<subfolder>/<name>. Returns the Drive file id and view link. */
export async function uploadToDrive(file: File, opts: { subfolder?: string; name: string }): Promise<DriveFile> {
  const parent = opts.subfolder ? await ensureSubfolder(opts.subfolder) : getDriveConfig().folderId;
  const meta = { name: opts.name, parents: [parent] };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', file);
  return api<DriveFile>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,thumbnailLink&supportsAllDrives=true', { method: 'POST', body });
}

/** Builds a tidy Drive file name: GW-AST-MOB-0001__Invoice__2026-09-22__original.pdf */
export function driveFileName(tag: string | undefined, kind: string, original: string) {
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return [tag && safe(tag), safe(kind), new Date().toISOString().slice(0, 10), safe(original)].filter(Boolean).join('__');
}
