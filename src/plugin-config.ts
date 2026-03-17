import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { invalidatePluginCache } from './plugin-scanner';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SETTINGS_LOCAL_PATH = path.join(CLAUDE_DIR, 'settings.local.json');

// ---------------------------------------------------------------------------
// Async Mutex — serialises all file writes so concurrent callers don't race
// ---------------------------------------------------------------------------

class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const mutex = new AsyncMutex();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Atomic JSON write
// ---------------------------------------------------------------------------

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  const bakPath = `${filePath}.bak`;
  const json = JSON.stringify(data, null, 2);

  // Write to .tmp
  fs.writeFileSync(tmpPath, json, 'utf-8');

  // Back up current file if it exists
  const currentExists = fs.existsSync(filePath);
  if (currentExists) {
    fs.copyFileSync(filePath, bakPath);
  }

  try {
    // Rename tmp → target (Windows may throw EEXIST if target exists)
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EEXIST') {
        fs.unlinkSync(filePath);
        fs.renameSync(tmpPath, filePath);
      } else {
        throw err;
      }
    }
  } catch (writeErr) {
    // Attempt to restore backup
    if (currentExists && fs.existsSync(bakPath)) {
      try {
        fs.copyFileSync(bakPath, filePath);
      } catch {
        // Best-effort restore; swallow secondary error
      }
    }
    throw writeErr;
  }
}

// ---------------------------------------------------------------------------
// Toggle plugin enabled/disabled
// ---------------------------------------------------------------------------

export async function togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
  const release = await mutex.acquire();
  try {
    const settings: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(SETTINGS_PATH) ?? {};
    const enabledPlugins: Record<string, boolean> =
      (settings['enabledPlugins'] as Record<string, boolean> | undefined) ?? {};

    if (enabled) {
      enabledPlugins[pluginId] = true;
    } else {
      delete enabledPlugins[pluginId];
    }

    settings['enabledPlugins'] = enabledPlugins;
    await atomicWriteJson(SETTINGS_PATH, settings);
    invalidatePluginCache();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Get settings (merged, sanitised)
// ---------------------------------------------------------------------------

const SECRET_KEYS = new Set(['token', 'secret', 'password', 'apiKey', 'api_key', 'auth']);

function sanitise(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitise);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = sanitise(v);
    }
  }
  return result;
}

export async function getSettings(): Promise<object> {
  const base: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(SETTINGS_PATH) ?? {};
  const local: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(SETTINGS_LOCAL_PATH) ?? {};
  const merged = { ...base, ...local };
  return sanitise(merged) as object;
}

// ---------------------------------------------------------------------------
// Update settings — validated path allowlist
// ---------------------------------------------------------------------------

type AllowedPath =
  | `enabledPlugins.${string}`
  | 'effortLevel'
  | 'permissions.allow'
  | 'permissions.deny';

function isAllowedPath(p: string): p is AllowedPath {
  return (
    /^enabledPlugins\..+$/.test(p) ||
    p === 'effortLevel' ||
    p === 'permissions.allow' ||
    p === 'permissions.deny'
  );
}

function resolveSettingsFile(p: AllowedPath): string {
  if (p === 'permissions.allow' || p === 'permissions.deny') {
    return SETTINGS_LOCAL_PATH;
  }
  return SETTINGS_PATH;
}

function validateValue(settingsPath: AllowedPath, value: unknown): void {
  if (/^enabledPlugins\..+$/.test(settingsPath)) {
    if (typeof value !== 'boolean') {
      throw new TypeError(`Value for "${settingsPath}" must be boolean, got ${typeof value}`);
    }
    return;
  }
  if (settingsPath === 'effortLevel') {
    if (value !== 'low' && value !== 'medium' && value !== 'high') {
      throw new TypeError(`Value for "effortLevel" must be "low" | "medium" | "high", got ${JSON.stringify(value)}`);
    }
    return;
  }
  if (settingsPath === 'permissions.allow' || settingsPath === 'permissions.deny') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      throw new TypeError(`Value for "${settingsPath}" must be string[], got ${JSON.stringify(value)}`);
    }
    return;
  }
}

/** Apply a dot-path assignment or deletion to a plain object (mutates). */
function applyDeepSet(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
  remove: boolean,
): void {
  const parts = dotPath.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cursor[part] === null || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (remove) {
    delete cursor[last];
  } else {
    cursor[last] = value;
  }
}

export async function updateSettings(settingsPath: string, value: unknown): Promise<void> {
  if (!isAllowedPath(settingsPath)) {
    throw new Error(
      `Settings path "${settingsPath}" is not in the allowlist. ` +
        `Allowed: enabledPlugins.*, effortLevel, permissions.allow, permissions.deny`,
    );
  }

  validateValue(settingsPath, value);

  const release = await mutex.acquire();
  try {
    const filePath = resolveSettingsFile(settingsPath);
    const data: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(filePath) ?? {};

    // For enabledPlugins.* with boolean false → delete the key (same semantics as togglePlugin)
    const isEnableKey = /^enabledPlugins\..+$/.test(settingsPath);
    const shouldDelete = isEnableKey && value === false;

    applyDeepSet(data, settingsPath, value, shouldDelete);
    await atomicWriteJson(filePath, data);

    if (settingsPath.startsWith('enabledPlugins')) {
      invalidatePluginCache();
    }
  } finally {
    release();
  }
}
