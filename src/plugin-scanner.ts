import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  InstalledPluginsFile, PluginInfo, PluginInstallation, PluginManifest,
  SkillInfo, AgentInfo, CommandInfo, HookInfo, McpServerInfo, ModeInfo
} from './types';
import { parseFrontmatter } from './frontmatter';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const OFFICIAL_SOURCE = 'claude-plugins-official';

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parsePluginKey(key: string): { name: string; source: string } {
  const atIdx = key.lastIndexOf('@');
  if (atIdx <= 0) return { name: key, source: '' };
  return { name: key.slice(0, atIdx), source: key.slice(atIdx + 1) };
}

function pickPrimaryInstallation(installations: PluginInstallation[]): PluginInstallation {
  return installations.find(i => i.scope === 'user') || installations[0];
}

function scanSkills(installPath: string): SkillInfo[] {
  const skillsDir = path.join(installPath, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  const results: SkillInfo[] = [];
  try {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      try {
        const content = fs.readFileSync(skillFile, 'utf-8');
        const { attributes } = parseFrontmatter(content);
        results.push({
          name: attributes['name'] || entry.name,
          description: attributes['description'] || '',
          userInvocable: attributes['user-invocable'] !== 'false',
          modelInvocable: attributes['disable-model-invocation'] !== 'true',
        });
      } catch { /* skip unreadable skill */ }
    }
  } catch { /* skip unreadable dir */ }
  return results;
}

function scanMarkdownDir(dirPath: string): { name: string; attributes: Record<string, string> }[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: { name: string; attributes: Record<string, string> }[] = [];
  try {
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const { attributes } = parseFrontmatter(content);
        results.push({ name: file.replace('.md', ''), attributes });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function scanAgents(installPath: string): AgentInfo[] {
  return scanMarkdownDir(path.join(installPath, 'agents')).map(({ name, attributes }) => ({
    name: attributes['name'] || name,
    description: attributes['description'] || '',
    model: attributes['model'],
    color: attributes['color'],
  }));
}

function scanCommands(installPath: string): CommandInfo[] {
  return scanMarkdownDir(path.join(installPath, 'commands')).map(({ name, attributes }) => ({
    name: attributes['name'] || name,
    description: attributes['description'] || '',
    argumentHint: attributes['argument-hint'],
  }));
}

function scanHooks(installPath: string): HookInfo[] {
  const hooksFile = path.join(installPath, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksFile)) return [];
  try {
    const data = readJsonSafe<any>(hooksFile);
    if (!data || !data.hooks) return [];
    const results: HookInfo[] = [];
    for (const [event, matcherGroups] of Object.entries<any[]>(data.hooks)) {
      if (!Array.isArray(matcherGroups)) continue;
      for (const group of matcherGroups) {
        const matcher = group.matcher;
        const hooks = group.hooks;
        if (!Array.isArray(hooks)) continue;
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
  } catch {
    return [];
  }
}

function scanMcpServers(installPath: string): McpServerInfo[] {
  const mcpFile = path.join(installPath, '.mcp.json');
  if (!fs.existsSync(mcpFile)) return [];
  try {
    const data = readJsonSafe<any>(mcpFile);
    if (!data) return [];
    const servers = data.mcpServers || data;
    const results: McpServerInfo[] = [];
    for (const [name, config] of Object.entries<any>(servers)) {
      if (name === 'mcpServers') continue;
      let type: 'stdio' | 'http' | undefined = config.type;
      if (!type) {
        if (config.command) type = 'stdio';
        else if (config.url) type = 'http';
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
  } catch {
    return [];
  }
}

function scanModes(installPath: string): ModeInfo[] {
  const modesDir = path.join(installPath, 'modes');
  if (!fs.existsSync(modesDir)) return [];
  try {
    return fs.readdirSync(modesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f.replace('.json', '') }));
  } catch {
    return [];
  }
}

function scanClaudeMd(installPath: string): { hasClaudeMd: boolean; claudeMdPreview?: string } {
  const claudeMdPath = path.join(installPath, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return { hasClaudeMd: false };
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    return { hasClaudeMd: true, claudeMdPreview: content.slice(0, 500) };
  } catch {
    return { hasClaudeMd: false };
  }
}

function readManifest(installPath: string): PluginManifest {
  const manifestPath = path.join(installPath, '.claude-plugin', 'plugin.json');
  const manifest = readJsonSafe<any>(manifestPath);
  if (manifest) return manifest as PluginManifest;
  const pkgPath = path.join(installPath, 'package.json');
  const pkg = readJsonSafe<any>(pkgPath);
  if (pkg) {
    return { name: pkg.name, description: pkg.description, version: pkg.version };
  }
  return {};
}

const CACHE_TTL_MS = 5000;
let cachedPlugins: PluginInfo[] | null = null;
let cacheTimestamp = 0;

function isCacheFresh(): boolean {
  return cachedPlugins !== null && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

export function scanAllPlugins(): PluginInfo[] {
  if (isCacheFresh()) return cachedPlugins!;

  const installedFile = path.join(PLUGINS_DIR, 'installed_plugins.json');
  const installed = readJsonSafe<InstalledPluginsFile>(installedFile);
  if (!installed || !installed.plugins) return [];

  const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJsonSafe<any>(settingsFile);
  const enabledMap: Record<string, boolean> = settings?.enabledPlugins || {};

  const plugins: PluginInfo[] = [];

  for (const [key, installations] of Object.entries(installed.plugins)) {
    if (!Array.isArray(installations) || installations.length === 0) continue;
    const { name, source } = parsePluginKey(key);
    const primary = pickPrimaryInstallation(installations);
    const installPath = primary.installPath;

    let pluginInfo: PluginInfo;
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
    } catch (err) {
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

export function invalidatePluginCache(): void {
  cachedPlugins = null;
  cacheTimestamp = 0;
}

export function getPluginById(id: string): PluginInfo | null {
  return scanAllPlugins().find(p => p.id === id) || null;
}

export function searchPlugins(
  plugins: PluginInfo[], query: string, filter?: string, source?: string
): PluginInfo[] {
  let results = plugins;
  if (filter === 'enabled') results = results.filter(p => p.enabled);
  if (filter === 'disabled') results = results.filter(p => !p.enabled);
  if (source === 'official') results = results.filter(p => p.isOfficial);
  if (source === 'community') results = results.filter(p => !p.isOfficial);

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      p.skills.some(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) ||
      p.agents.some(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) ||
      p.commands.some(c => c.name.toLowerCase().includes(q))
    );
  }
  return results;
}
