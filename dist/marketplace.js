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
exports.scanMarketplace = scanMarketplace;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const plugin_scanner_1 = require("./plugin-scanner");
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const KNOWN_MARKETPLACES_FILE = path.join(PLUGINS_DIR, 'known_marketplaces.json');
function readJsonSafe(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function readPluginJson(pluginDir) {
    const pluginJsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    return readJsonSafe(pluginJsonPath) ?? {};
}
function scanMarketplaceCategory(baseDir, marketplaceName, repo, category, installedNames, installedVersionMap) {
    if (!fs.existsSync(baseDir))
        return [];
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(baseDir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const pluginDir = path.join(baseDir, entry.name);
        const meta = readPluginJson(pluginDir);
        const name = meta.name || entry.name;
        const isInstalled = installedNames.has(name) || installedNames.has(entry.name);
        const installedVersion = installedVersionMap.get(name) ?? installedVersionMap.get(entry.name);
        results.push({
            name,
            marketplace: marketplaceName,
            repo,
            description: meta.description,
            author: meta.author,
            isInstalled,
            installedVersion,
            category,
        });
    }
    return results;
}
function scanMarketplace() {
    const knownMarketplaces = readJsonSafe(KNOWN_MARKETPLACES_FILE);
    if (!knownMarketplaces)
        return [];
    // Build a set of installed plugin names and their versions for fast lookup
    const installed = (0, plugin_scanner_1.scanAllPlugins)();
    const installedNames = new Set(installed.map(p => p.name));
    const installedVersionMap = new Map();
    for (const p of installed) {
        const version = p.installations[0]?.version;
        if (version)
            installedVersionMap.set(p.name, version);
    }
    const allPlugins = [];
    for (const [marketplaceName, entry] of Object.entries(knownMarketplaces)) {
        const repo = entry.source?.repo ?? '';
        const installLocation = entry.installLocation;
        const internalDir = path.join(installLocation, 'plugins');
        const externalDir = path.join(installLocation, 'external_plugins');
        allPlugins.push(...scanMarketplaceCategory(internalDir, marketplaceName, repo, 'internal', installedNames, installedVersionMap), ...scanMarketplaceCategory(externalDir, marketplaceName, repo, 'external', installedNames, installedVersionMap));
    }
    return allPlugins.sort((a, b) => {
        const mc = a.marketplace.localeCompare(b.marketplace);
        return mc !== 0 ? mc : a.name.localeCompare(b.name);
    });
}
