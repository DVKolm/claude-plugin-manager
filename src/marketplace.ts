import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarketplacePlugin } from './types';
import { scanAllPlugins } from './plugin-scanner';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const KNOWN_MARKETPLACES_FILE = path.join(PLUGINS_DIR, 'known_marketplaces.json');

interface MarketplaceSource {
  source: string;
  repo: string;
}

interface KnownMarketplaceEntry {
  source: MarketplaceSource;
  installLocation: string;
  lastUpdated: string;
}

type KnownMarketplacesFile = Record<string, KnownMarketplaceEntry>;

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readPluginJson(pluginDir: string): { name?: string; description?: string; author?: { name: string; email?: string } } {
  const pluginJsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  return readJsonSafe<{ name?: string; description?: string; author?: { name: string; email?: string } }>(pluginJsonPath) ?? {};
}

function scanMarketplaceCategory(
  baseDir: string,
  marketplaceName: string,
  repo: string,
  category: 'internal' | 'external',
  installedNames: Set<string>,
  installedVersionMap: Map<string, string>
): MarketplacePlugin[] {
  if (!fs.existsSync(baseDir)) return [];

  const results: MarketplacePlugin[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

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

export function scanMarketplace(): MarketplacePlugin[] {
  const knownMarketplaces = readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES_FILE);
  if (!knownMarketplaces) return [];

  // Build a set of installed plugin names and their versions for fast lookup
  const installed = scanAllPlugins();
  const installedNames = new Set<string>(installed.map(p => p.name));
  const installedVersionMap = new Map<string, string>();
  for (const p of installed) {
    const version = p.installations[0]?.version;
    if (version) installedVersionMap.set(p.name, version);
  }

  const allPlugins: MarketplacePlugin[] = [];

  for (const [marketplaceName, entry] of Object.entries(knownMarketplaces)) {
    const repo = entry.source?.repo ?? '';
    const installLocation = entry.installLocation;

    const internalDir = path.join(installLocation, 'plugins');
    const externalDir = path.join(installLocation, 'external_plugins');

    allPlugins.push(
      ...scanMarketplaceCategory(internalDir, marketplaceName, repo, 'internal', installedNames, installedVersionMap),
      ...scanMarketplaceCategory(externalDir, marketplaceName, repo, 'external', installedNames, installedVersionMap)
    );
  }

  return allPlugins.sort((a, b) => {
    const mc = a.marketplace.localeCompare(b.marketplace);
    return mc !== 0 ? mc : a.name.localeCompare(b.name);
  });
}
