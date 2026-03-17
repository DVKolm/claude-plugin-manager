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
exports.scanAllPlugins = scanAllPlugins;
exports.invalidatePluginCache = invalidatePluginCache;
exports.getPluginById = getPluginById;
exports.searchPlugins = searchPlugins;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const frontmatter_1 = require("./frontmatter");
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const OFFICIAL_SOURCE = 'claude-plugins-official';
function readJsonSafe(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function parsePluginKey(key) {
    const atIdx = key.lastIndexOf('@');
    if (atIdx <= 0)
        return { name: key, source: '' };
    return { name: key.slice(0, atIdx), source: key.slice(atIdx + 1) };
}
function pickPrimaryInstallation(installations) {
    return installations.find(i => i.scope === 'user') || installations[0];
}
function scanSkills(installPath) {
    const skillsDir = path.join(installPath, 'skills');
    if (!fs.existsSync(skillsDir))
        return [];
    const results = [];
    try {
        for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillFile))
                continue;
            try {
                const content = fs.readFileSync(skillFile, 'utf-8');
                const { attributes } = (0, frontmatter_1.parseFrontmatter)(content);
                results.push({
                    name: attributes['name'] || entry.name,
                    description: attributes['description'] || '',
                    userInvocable: attributes['user-invocable'] !== 'false',
                    modelInvocable: attributes['disable-model-invocation'] !== 'true',
                });
            }
            catch { /* skip unreadable skill */ }
        }
    }
    catch { /* skip unreadable dir */ }
    return results;
}
function scanMarkdownDir(dirPath) {
    if (!fs.existsSync(dirPath))
        return [];
    const results = [];
    try {
        for (const file of fs.readdirSync(dirPath)) {
            if (!file.endsWith('.md'))
                continue;
            try {
                const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
                const { attributes } = (0, frontmatter_1.parseFrontmatter)(content);
                results.push({ name: file.replace('.md', ''), attributes });
            }
            catch { /* skip */ }
        }
    }
    catch { /* skip */ }
    return results;
}
function scanAgents(installPath) {
    return scanMarkdownDir(path.join(installPath, 'agents')).map(({ name, attributes }) => ({
        name: attributes['name'] || name,
        description: attributes['description'] || '',
        model: attributes['model'],
        color: attributes['color'],
    }));
}
function scanCommands(installPath) {
    return scanMarkdownDir(path.join(installPath, 'commands')).map(({ name, attributes }) => ({
        name: attributes['name'] || name,
        description: attributes['description'] || '',
        argumentHint: attributes['argument-hint'],
    }));
}
function scanHooks(installPath) {
    const hooksFile = path.join(installPath, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksFile))
        return [];
    try {
        const data = readJsonSafe(hooksFile);
        if (!data || !data.hooks)
            return [];
        const results = [];
        for (const [event, matcherGroups] of Object.entries(data.hooks)) {
            if (!Array.isArray(matcherGroups))
                continue;
            for (const group of matcherGroups) {
                const matcher = group.matcher;
                const hooks = group.hooks;
                if (!Array.isArray(hooks))
                    continue;
                for (const hook of hooks) {
                    results.push({
                        event,
                        matcher: matcher || undefined,
                        type: hook.type || 'command',
                        command: hook.command || '',
                        async: hook.async,
                        timeout: hook.timeout,
                    });
                }
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
function scanMcpServers(installPath) {
    const mcpFile = path.join(installPath, '.mcp.json');
    if (!fs.existsSync(mcpFile))
        return [];
    try {
        const data = readJsonSafe(mcpFile);
        if (!data)
            return [];
        const servers = data.mcpServers || data;
        const results = [];
        for (const [name, config] of Object.entries(servers)) {
            if (name === 'mcpServers')
                continue;
            let type = config.type;
            if (!type) {
                if (config.command)
                    type = 'stdio';
                else if (config.url)
                    type = 'http';
            }
            results.push({
                name,
                type,
                command: config.command,
                args: config.args,
                url: config.url,
            });
        }
        return results;
    }
    catch {
        return [];
    }
}
function scanModes(installPath) {
    const modesDir = path.join(installPath, 'modes');
    if (!fs.existsSync(modesDir))
        return [];
    try {
        return fs.readdirSync(modesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({ name: f.replace('.json', '') }));
    }
    catch {
        return [];
    }
}
function scanClaudeMd(installPath) {
    const claudeMdPath = path.join(installPath, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath))
        return { hasClaudeMd: false };
    try {
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        return { hasClaudeMd: true, claudeMdPreview: content.slice(0, 500) };
    }
    catch {
        return { hasClaudeMd: false };
    }
}
function readManifest(installPath) {
    const manifestPath = path.join(installPath, '.claude-plugin', 'plugin.json');
    const manifest = readJsonSafe(manifestPath);
    if (manifest)
        return manifest;
    const pkgPath = path.join(installPath, 'package.json');
    const pkg = readJsonSafe(pkgPath);
    if (pkg) {
        return { name: pkg.name, description: pkg.description, version: pkg.version };
    }
    return {};
}
const CACHE_TTL_MS = 5000;
let cachedPlugins = null;
let cacheTimestamp = 0;
function isCacheFresh() {
    return cachedPlugins !== null && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}
function scanAllPlugins() {
    if (isCacheFresh())
        return cachedPlugins;
    const installedFile = path.join(PLUGINS_DIR, 'installed_plugins.json');
    const installed = readJsonSafe(installedFile);
    if (!installed || !installed.plugins)
        return [];
    const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
    const settings = readJsonSafe(settingsFile);
    const enabledMap = settings?.enabledPlugins || {};
    const plugins = [];
    for (const [key, installations] of Object.entries(installed.plugins)) {
        if (!Array.isArray(installations) || installations.length === 0)
            continue;
        const { name, source } = parsePluginKey(key);
        const primary = pickPrimaryInstallation(installations);
        const installPath = primary.installPath;
        let pluginInfo;
        try {
            const manifest = readManifest(installPath);
            const claudeMd = scanClaudeMd(installPath);
            pluginInfo = {
                id: key, name, source,
                isOfficial: source === OFFICIAL_SOURCE,
                enabled: enabledMap[key] === true,
                installations,
                description: manifest.description,
                author: manifest.author,
                homepage: manifest.homepage,
                repository: manifest.repository,
                license: manifest.license,
                keywords: manifest.keywords,
                skills: scanSkills(installPath),
                agents: scanAgents(installPath),
                commands: scanCommands(installPath),
                hooks: scanHooks(installPath),
                mcpServers: scanMcpServers(installPath),
                modes: scanModes(installPath),
                hasClaudeMd: claudeMd.hasClaudeMd,
                claudeMdPreview: claudeMd.claudeMdPreview,
            };
        }
        catch (err) {
            pluginInfo = {
                id: key, name, source,
                isOfficial: source === OFFICIAL_SOURCE,
                enabled: enabledMap[key] === true,
                installations,
                skills: [], agents: [], commands: [],
                hooks: [], mcpServers: [], modes: [],
                hasClaudeMd: false,
                error: `Failed to scan: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
        plugins.push(pluginInfo);
    }
    const sorted = plugins.sort((a, b) => a.name.localeCompare(b.name));
    cachedPlugins = sorted;
    cacheTimestamp = Date.now();
    return sorted;
}
function invalidatePluginCache() {
    cachedPlugins = null;
    cacheTimestamp = 0;
}
function getPluginById(id) {
    return scanAllPlugins().find(p => p.id === id) || null;
}
function searchPlugins(plugins, query, filter, source) {
    let results = plugins;
    if (filter === 'enabled')
        results = results.filter(p => p.enabled);
    if (filter === 'disabled')
        results = results.filter(p => !p.enabled);
    if (source === 'official')
        results = results.filter(p => p.isOfficial);
    if (source === 'community')
        results = results.filter(p => !p.isOfficial);
    if (query) {
        const q = query.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            p.skills.some(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) ||
            p.agents.some(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) ||
            p.commands.some(c => c.name.toLowerCase().includes(q)));
    }
    return results;
}
