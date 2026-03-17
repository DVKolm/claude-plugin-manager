"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePlugin = togglePlugin;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const plugin_scanner_1 = require("./plugin-scanner");
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SETTINGS_LOCAL_PATH = path.join(CLAUDE_DIR, 'settings.local.json');
// ---------------------------------------------------------------------------
// Async Mutex — serialises all file writes so concurrent callers don't race
// ---------------------------------------------------------------------------
class AsyncMutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
    async acquire() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (!this.locked) {
                    this.locked = true;
                    resolve(() => this.release());
                }
                else {
                    this.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }
    release() {
        const next = this.queue.shift();
        if (next) {
            next();
        }
        else {
            this.locked = false;
        }
    }
}
const mutex = new AsyncMutex();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readJsonSafe(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Atomic JSON write
// ---------------------------------------------------------------------------
async function atomicWriteJson(filePath, data) {
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
        }
        catch (err) {
            const nodeErr = err;
            if (nodeErr.code === 'EEXIST') {
                fs.unlinkSync(filePath);
                fs.renameSync(tmpPath, filePath);
            }
            else {
                throw err;
            }
        }
    }
    catch (writeErr) {
        // Attempt to restore backup
        if (currentExists && fs.existsSync(bakPath)) {
            try {
                fs.copyFileSync(bakPath, filePath);
            }
            catch {
                // Best-effort restore; swallow secondary error
            }
        }
        throw writeErr;
    }
}
// ---------------------------------------------------------------------------
// Toggle plugin enabled/disabled
// ---------------------------------------------------------------------------
async function togglePlugin(pluginId, enabled) {
    const release = await mutex.acquire();
    try {
        const settings = readJsonSafe(SETTINGS_PATH) ?? {};
        const enabledPlugins = settings['enabledPlugins'] ?? {};
        if (enabled) {
            enabledPlugins[pluginId] = true;
        }
        else {
            delete enabledPlugins[pluginId];
        }
        settings['enabledPlugins'] = enabledPlugins;
        await atomicWriteJson(SETTINGS_PATH, settings);
        (0, plugin_scanner_1.invalidatePluginCache)();
    }
    finally {
        release();
    }
}
// ---------------------------------------------------------------------------
// Get settings (merged, sanitised)
// ---------------------------------------------------------------------------
const SECRET_KEYS = new Set(['token', 'secret', 'password', 'apiKey', 'api_key', 'auth']);
function sanitise(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj))
        return obj.map(sanitise);
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (SECRET_KEYS.has(k)) {
            result[k] = '[REDACTED]';
        }
        else {
            result[k] = sanitise(v);
        }
    }
    return result;
}
async function getSettings() {
    const base = readJsonSafe(SETTINGS_PATH) ?? {};
    const local = readJsonSafe(SETTINGS_LOCAL_PATH) ?? {};
    const merged = { ...base, ...local };
    return sanitise(merged);
}
function isAllowedPath(p) {
    return (/^enabledPlugins\..+$/.test(p) ||
        p === 'effortLevel' ||
        p === 'permissions.allow' ||
        p === 'permissions.deny');
}
function resolveSettingsFile(p) {
    if (p === 'permissions.allow' || p === 'permissions.deny') {
        return SETTINGS_LOCAL_PATH;
    }
    return SETTINGS_PATH;
}
function validateValue(settingsPath, value) {
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
function applyDeepSet(obj, dotPath, value, remove) {
    const parts = dotPath.split('.');
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (cursor[part] === null || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
            cursor[part] = {};
        }
        cursor = cursor[part];
    }
    const last = parts[parts.length - 1];
    if (remove) {
        delete cursor[last];
    }
    else {
        cursor[last] = value;
    }
}
async function updateSettings(settingsPath, value) {
    if (!isAllowedPath(settingsPath)) {
        throw new Error(`Settings path "${settingsPath}" is not in the allowlist. ` +
            `Allowed: enabledPlugins.*, effortLevel, permissions.allow, permissions.deny`);
    }
    validateValue(settingsPath, value);
    const release = await mutex.acquire();
    try {
        const filePath = resolveSettingsFile(settingsPath);
        const data = readJsonSafe(filePath) ?? {};
        // For enabledPlugins.* with boolean false → delete the key (same semantics as togglePlugin)
        const isEnableKey = /^enabledPlugins\..+$/.test(settingsPath);
        const shouldDelete = isEnableKey && value === false;
        applyDeepSet(data, settingsPath, value, shouldDelete);
        await atomicWriteJson(filePath, data);
        if (settingsPath.startsWith('enabledPlugins')) {
            (0, plugin_scanner_1.invalidatePluginCache)();
        }
    }
    finally {
        release();
    }
}
