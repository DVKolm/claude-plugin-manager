# Plugin Manager Phase 1 — Read-Only Viewer

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working read-only plugin manager that scans all installed Claude Code plugins and displays them in a browser UI with search and filters.

**Architecture:** Skill-only Claude Code plugin with on-demand HTTP server. Server reads plugin data from `~/.claude/plugins/` filesystem, serves REST API + static UI. No MCP server, no frameworks, no runtime dependencies.

**Tech Stack:** TypeScript (compiled to CommonJS), Node.js built-in `http`/`fs`/`path`/`crypto`, Vanilla HTML/CSS/JS

**Spec:** `docs/superpowers/specs/2026-03-17-plugin-manager-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.gitignore` | Ignore dist/, node_modules/ |
| `package.json` | Scripts: build, start |
| `tsconfig.json` | TypeScript config |
| `src/types.ts` | All TypeScript interfaces |
| `src/frontmatter.ts` | YAML frontmatter parser (key:value between `---`) |
| `src/plugin-scanner.ts` | Reads installed_plugins.json, settings.json, scans plugin dirs |
| `src/router.ts` | Lightweight HTTP router with path params, query parsing |
| `src/auth.ts` | Token generation, cookie exchange, Host validation |
| `src/server.ts` | Entry point: HTTP server, idle timeout, startup JSON |
| `ui/index.html` | SPA shell with inline favicon + Lucide SVGs |
| `ui/styles.css` | Full Anthropic theme (light + dark mode) |
| `ui/app.js` | Frontend: fetch API, render list + detail, search, filters |
| `skills/open/SKILL.md` | `/plugin-manager:open` skill definition |
| `scripts/build.js` | Build script: tsc + copy ui/ to dist/ui/ |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `scripts/build.js`

- [ ] **Step 1: Initialize git repo**

```bash
cd C:/Users/IVA-PC/WebstormProjects/claude-plugin-manager
git init
```

- [ ] **Step 2: Create plugin manifest**

Create `.claude-plugin/plugin.json`:
```json
{
  "name": "plugin-manager",
  "description": "Visual web UI for managing Claude Code plugins",
  "version": "1.0.0",
  "author": {
    "name": "Claude Plugin Manager"
  }
}
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "claude-plugin-manager",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node scripts/build.js",
    "start": "node dist/server.js"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 6: Create build script**

Create `scripts/build.js`:
```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Compile TypeScript
execSync('npx tsc', { stdio: 'inherit' });

// Copy UI files to dist/ui/
const uiSrc = path.join(__dirname, '..', 'ui');
const uiDist = path.join(__dirname, '..', 'dist', 'ui');

fs.mkdirSync(uiDist, { recursive: true });

for (const file of fs.readdirSync(uiSrc)) {
  fs.copyFileSync(path.join(uiSrc, file), path.join(uiDist, file));
}

console.log('Build complete: dist/');
```

- [ ] **Step 7: Install dependencies and verify build setup**

```bash
npm install
```

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin/ package.json tsconfig.json .gitignore scripts/
git commit -m "feat: project scaffolding with build pipeline"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write all interfaces**

Create `src/types.ts` with all interfaces from the spec:

```typescript
export interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, PluginInstallation[]>;
}

export interface PluginInstallation {
  scope: 'user' | 'project' | 'local';
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  source: string;
  isOfficial: boolean;
  enabled: boolean;
  installations: PluginInstallation[];
  description?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  skills: SkillInfo[];
  agents: AgentInfo[];
  commands: CommandInfo[];
  hooks: HookInfo[];
  mcpServers: McpServerInfo[];
  modes: ModeInfo[];
  hasClaudeMd: boolean;
  claudeMdPreview?: string;
  error?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  userInvocable: boolean;
  modelInvocable: boolean;
}

export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
  color?: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface HookInfo {
  event: string;
  matcher?: string;
  type: string;
  command: string;
  async?: boolean;
  timeout?: number;
}

export interface McpServerInfo {
  name: string;
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
}

export interface ModeInfo {
  name: string;
  slug?: string;
}

export interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
}

export interface ServerInfo {
  port: number;
  pid: number;
  tokenHash: string;
  startedAt: string;
}

export interface ApiError {
  error: string;
  code: string;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript interfaces for plugin data model"
```

---

### Task 3: Frontmatter Parser

**Files:**
- Create: `src/frontmatter.ts`

- [ ] **Step 1: Write the frontmatter parser**

Create `src/frontmatter.ts`:

```typescript
export interface FrontmatterResult {
  attributes: Record<string, string>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const lines = content.split('\n');
  const attributes: Record<string, string> = {};
  let bodyStart = 0;

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { attributes, body: content };
  }

  let foundEnd = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      bodyStart = i + 1;
      foundEnd = true;
      break;
    }
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx > 0) {
      const key = lines[i].slice(0, colonIdx).trim();
      let value = lines[i].slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        attributes[key] = value;
      }
    }
  }

  if (!foundEnd) {
    return { attributes: {}, body: content };
  }

  return {
    attributes,
    body: lines.slice(bodyStart).join('\n'),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/frontmatter.ts
git commit -m "feat: add YAML frontmatter parser (key:value, no dependencies)"
```

---

### Task 4: Plugin Scanner

**Files:**
- Create: `src/plugin-scanner.ts`

- [ ] **Step 1: Write the plugin scanner**

Create `src/plugin-scanner.ts`. This is the largest module — reads all plugin data from filesystem.

```typescript
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
    // Format A: wrapped in "mcpServers"
    const servers = data.mcpServers || data;
    const results: McpServerInfo[] = [];
    for (const [name, config] of Object.entries<any>(servers)) {
      if (name === 'mcpServers') continue; // skip if iterating top-level with mcpServers key
      results.push({
        name,
        type: config.type || (config.command ? 'stdio' : config.url ? 'http' : undefined),
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
    return {
      hasClaudeMd: true,
      claudeMdPreview: content.slice(0, 500),
    };
  } catch {
    return { hasClaudeMd: false };
  }
}

function readManifest(installPath: string): PluginManifest {
  // Try .claude-plugin/plugin.json first
  const manifestPath = path.join(installPath, '.claude-plugin', 'plugin.json');
  const manifest = readJsonSafe<any>(manifestPath);
  if (manifest) return manifest as PluginManifest;

  // Fallback to package.json
  const pkgPath = path.join(installPath, 'package.json');
  const pkg = readJsonSafe<any>(pkgPath);
  if (pkg) {
    return {
      name: pkg.name,
      description: pkg.description,
      version: pkg.version,
    };
  }

  return {};
}

export function scanAllPlugins(): PluginInfo[] {
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
        id: key,
        name,
        source,
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

  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

export function getPluginById(id: string): PluginInfo | null {
  const all = scanAllPlugins();
  return all.find(p => p.id === id) || null;
}

export function searchPlugins(
  plugins: PluginInfo[],
  query: string,
  filter?: string,
  source?: string
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/plugin-scanner.ts
git commit -m "feat: plugin scanner — reads installed_plugins.json v2 format, scans all plugin components"
```

---

### Task 5: HTTP Router

**Files:**
- Create: `src/router.ts`

- [ ] **Step 1: Write the router**

Create `src/router.ts`:

```typescript
import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, query: Record<string, string>) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  private compilePattern(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    return { pattern: new RegExp(`^${regexStr}$`), paramNames };
  }

  get(path: string, handler: Handler): void {
    const { pattern, paramNames } = this.compilePattern(path);
    this.routes.push({ method: 'GET', pattern, paramNames, handler });
  }

  post(path: string, handler: Handler): void {
    const { pattern, paramNames } = this.compilePattern(path);
    this.routes.push({ method: 'POST', pattern, paramNames, handler });
  }

  patch(path: string, handler: Handler): void {
    const { pattern, paramNames } = this.compilePattern(path);
    this.routes.push({ method: 'PATCH', pattern, paramNames, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method || 'GET';
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => { query[k] = v; });

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        // Single decode — never double-decode
        params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
      }

      await route.handler(req, res, params, query);
      return true;
    }
    return false;
  }
}

export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function sendError(res: ServerResponse, status: number, error: string, code: string): void {
  sendJson(res, { error, code }, status);
}

export async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/router.ts
git commit -m "feat: lightweight HTTP router with path params and single-decode policy"
```

---

### Task 6: Auth Module

**Files:**
- Create: `src/auth.ts`

- [ ] **Step 1: Write auth module**

Create `src/auth.ts`:

```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IncomingMessage, ServerResponse } from 'http';
import { ServerInfo } from './types';

const SERVER_INFO_PATH = path.join(os.homedir(), '.claude', 'plugins', 'plugin-manager.json');

let sessionToken: string = '';
let sessionCookieValue: string = '';
let tokenUsed = false;

export function generateToken(): string {
  sessionToken = crypto.randomBytes(32).toString('hex');
  sessionCookieValue = crypto.randomBytes(32).toString('hex');
  tokenUsed = false;
  return sessionToken;
}

export function getTokenHash(): string {
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

export function writeServerInfo(port: number): void {
  const info: ServerInfo = {
    port,
    pid: process.pid,
    tokenHash: getTokenHash(),
    startedAt: new Date().toISOString(),
  };
  const dir = path.dirname(SERVER_INFO_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SERVER_INFO_PATH, JSON.stringify(info, null, 2), { mode: 0o600 });
}

export function cleanupServerInfo(): void {
  try { fs.unlinkSync(SERVER_INFO_PATH); } catch { /* ignore */ }
}

export function readExistingServerInfo(): ServerInfo | null {
  try {
    const raw = fs.readFileSync(SERVER_INFO_PATH, 'utf-8');
    return JSON.parse(raw) as ServerInfo;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getCookieName(port: number): string {
  return `pm-${port}`;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export function validateHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host || '';
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/**
 * Returns true if request is authenticated, false if it needs auth.
 * Handles token exchange (sets cookie, sends redirect) if token is in query.
 */
export function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  port: number
): 'authenticated' | 'redirected' | 'forbidden' {
  // Check Host header
  if (!validateHost(req, port)) {
    return 'forbidden';
  }

  // Check cookie
  const cookies = parseCookies(req);
  const cookieName = getCookieName(port);
  if (cookies[cookieName] === sessionCookieValue && sessionCookieValue) {
    return 'authenticated';
  }

  // Check URL token (one-time exchange)
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const urlToken = url.searchParams.get('token');

  if (urlToken && urlToken === sessionToken && !tokenUsed) {
    tokenUsed = true;
    // Set cookie and redirect to clean URL
    res.writeHead(302, {
      'Set-Cookie': `${cookieName}=${sessionCookieValue}; HttpOnly; SameSite=Strict; Path=/`,
      'Location': '/',
    });
    res.end();
    return 'redirected';
  }

  return 'forbidden';
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/auth.ts
git commit -m "feat: auth module — one-time token exchange, cookie auth, Host validation"
```

---

### Task 7: HTTP Server (Entry Point)

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Write the server**

Create `src/server.ts`:

```typescript
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Router, sendJson, sendError } from './router';
import {
  generateToken, writeServerInfo, cleanupServerInfo,
  readExistingServerInfo, isProcessAlive, handleAuth
} from './auth';
import { scanAllPlugins, getPluginById, searchPlugins } from './plugin-scanner';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const UI_DIR = path.join(__dirname, 'ui');

const PLUGIN_ID_REGEX = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+$/;

let idleTimer: NodeJS.Timeout;

function resetIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.error('Idle timeout reached. Shutting down.');
    cleanupServerInfo();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);
}

function serveStatic(res: http.ServerResponse, filePath: string, contentType: string): void {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function main(): void {
  // Check if already running
  const existing = readExistingServerInfo();
  if (existing && isProcessAlive(existing.pid)) {
    // Already running — output existing URL
    console.log(JSON.stringify({
      url: `http://localhost:${existing.port}`,
      port: existing.port,
      alreadyRunning: true,
    }));
    process.exit(0);
  }

  const token = generateToken();
  const router = new Router();

  // API Routes
  router.get('/api/health', (_req, res) => {
    sendJson(res, { status: 'ok', uptime: process.uptime() });
  });

  router.get('/api/plugins', (_req, res, _params, query) => {
    const all = scanAllPlugins();
    const filtered = searchPlugins(all, query.q || '', query.filter, query.source);
    // Return summary (without full details for list view)
    const summary = filtered.map(p => ({
      id: p.id,
      name: p.name,
      source: p.source,
      isOfficial: p.isOfficial,
      enabled: p.enabled,
      description: p.description,
      author: p.author,
      version: p.installations[0]?.version,
      skillCount: p.skills.length,
      agentCount: p.agents.length,
      commandCount: p.commands.length,
      hookCount: p.hooks.length,
      mcpServerCount: p.mcpServers.length,
      modeCount: p.modes.length,
      error: p.error,
    }));
    sendJson(res, { plugins: summary, total: all.length, filtered: summary.length });
  });

  router.get('/api/plugins/:id', (_req, res, params) => {
    const id = params.id;
    if (!PLUGIN_ID_REGEX.test(id)) {
      return sendError(res, 400, 'Invalid plugin ID format', 'INVALID_ID');
    }
    const plugin = getPluginById(id);
    if (!plugin) {
      return sendError(res, 404, 'Plugin not found', 'PLUGIN_NOT_FOUND');
    }
    sendJson(res, plugin);
  });

  // Static file routes
  router.get('/', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'index.html'), 'text/html; charset=utf-8');
  });
  router.get('/styles.css', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'styles.css'), 'text/css; charset=utf-8');
  });
  router.get('/app.js', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'app.js'), 'application/javascript; charset=utf-8');
  });

  const server = http.createServer(async (req, res) => {
    resetIdleTimer();

    // Auth check (except token exchange which handles its own response)
    const authResult = handleAuth(req, res, (server.address() as any)?.port || 0);
    if (authResult === 'redirected') return;
    if (authResult === 'forbidden') {
      // Serve a friendly 403 page for HTML requests
      const accept = req.headers.accept || '';
      if (accept.includes('text/html')) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>Session Expired</title>
          <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F5EEE6;color:#191919;}
          .box{text-align:center;max-width:400px;}.code{font-family:monospace;background:#E6DDD1;padding:4px 8px;border-radius:4px;}</style></head>
          <body><div class="box"><h2>Session Expired</h2><p>Reopen from Claude Code using <span class="code">/plugin-manager:open</span></p></div></body></html>`);
      } else {
        sendError(res, 403, 'Forbidden', 'AUTH_REQUIRED');
      }
      return;
    }

    // Route the request
    const handled = await router.handle(req, res);
    if (!handled) {
      sendError(res, 404, 'Not found', 'NOT_FOUND');
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number };
    writeServerInfo(addr.port);
    resetIdleTimer();

    // Print startup JSON to stdout for skill to read
    console.log(JSON.stringify({
      url: `http://localhost:${addr.port}?token=${token}`,
      port: addr.port,
    }));
  });

  // Cleanup on exit
  process.on('SIGINT', () => { cleanupServerInfo(); process.exit(0); });
  process.on('SIGTERM', () => { cleanupServerInfo(); process.exit(0); });
  process.on('exit', () => { cleanupServerInfo(); });
}

main();
```

- [ ] **Step 2: Build and test startup**

```bash
npm run build && node dist/server.js
```

Expected: prints JSON like `{"url":"http://localhost:XXXXX?token=...","port":XXXXX}`

Press Ctrl+C to stop.

- [ ] **Step 3: Test API endpoint**

```bash
npm run build && timeout 5 node dist/server.js &
sleep 2
# Get the port from output, then test health endpoint (will get 403 without cookie, which is expected)
```

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: HTTP server with auth, API routes, idle timeout, static file serving"
```

---

### Task 8: UI — HTML Shell

**Files:**
- Create: `ui/index.html`

- [ ] **Step 1: Write the HTML**

Create `ui/index.html` — SPA shell with inline Lucide SVG icons and favicon:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plugin Manager — Claude Code</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%23D97757'/><text x='16' y='22' text-anchor='middle' fill='white' font-size='18' font-family='system-ui'>P</text></svg>">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header id="header">
    <div class="header-left">
      <span class="header-logo">◉</span>
      <span class="header-title">Claude Plugin Manager</span>
    </div>
    <div class="header-right">
      <button id="settings-btn" class="header-btn" aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    </div>
  </header>

  <main id="app">
    <aside id="sidebar">
      <div class="sidebar-controls">
        <div class="search-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="search" placeholder="Search plugins..." aria-label="Search plugins">
          <button id="search-clear" class="search-clear" hidden aria-label="Clear search">×</button>
        </div>
        <div class="filters">
          <select id="filter-source" aria-label="Filter by source">
            <option value="">All Sources</option>
            <option value="official">Official</option>
            <option value="community">Community</option>
          </select>
          <select id="filter-status" aria-label="Filter by status">
            <option value="">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <div id="plugin-count" class="plugin-count" aria-live="polite"></div>
      <ul id="plugin-list" role="listbox" aria-label="Plugin list">
        <!-- Populated by JS -->
      </ul>
    </aside>

    <section id="detail" aria-label="Plugin details">
      <div id="detail-empty" class="empty-state">
        <p>Select a plugin to view details</p>
      </div>
      <div id="detail-content" hidden>
        <!-- Populated by JS -->
      </div>
      <div id="detail-loading" class="loading-skeleton" hidden>
        <div class="skeleton-line wide"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line narrow"></div>
        <div class="skeleton-section"></div>
        <div class="skeleton-section"></div>
      </div>
    </section>
  </main>

  <footer id="footer">
    <span>Plugin Manager v1.0.0</span>
    <span id="footer-count"></span>
  </footer>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add ui/index.html
git commit -m "feat: HTML shell with Lucide icons, ARIA roles, skeleton placeholders"
```

---

### Task 9: UI — CSS Theme

**Files:**
- Create: `ui/styles.css`

- [ ] **Step 1: Write complete Anthropic-themed CSS**

Create `ui/styles.css` — full implementation with light mode, dark mode, all components, responsive layout, loading skeletons, accessibility focus rings. This file is large (~400 lines) and implements the complete design spec including:
- CSS custom properties for all color tokens (light + dark)
- Typography scale
- Header, sidebar, detail panel layout
- Plugin list items with hover/selected states
- Collapsible sections with chevron rotation
- Toggle switch component
- Search input with clear button
- Filter dropdowns
- Loading skeleton shimmer animation
- Empty state styling
- Badge variants (Official, Community, Invocable)
- Toast notification positioning
- 403 session expired page
- Custom scrollbar
- Responsive breakpoint at 900px
- Focus ring on all interactive elements
- `prefers-color-scheme: dark` media query

The CSS should follow the exact color tokens, typography scale, and component specs from the design document sections "Color Palette", "Typography", "Components", "Accessibility", and "Responsive".

- [ ] **Step 2: Commit**

```bash
git add ui/styles.css
git commit -m "feat: Anthropic-themed CSS with dark mode, accessibility, responsive layout"
```

---

### Task 10: UI — Frontend JavaScript

**Files:**
- Create: `ui/app.js`

- [ ] **Step 1: Write frontend app**

Create `ui/app.js` — Vanilla JS SPA logic. Implements:
- `fetchPlugins()` — GET /api/plugins with search/filter query params
- `fetchPluginDetail(id)` — GET /api/plugins/:id
- `renderPluginList(plugins)` — populate sidebar list
- `renderPluginDetail(plugin)` — populate detail panel with all sections
- `renderCollapsibleSection(title, icon, items, renderItem)` — reusable collapsible
- Search input with 150ms debounce
- Filter dropdown change handlers
- Plugin list click → select → load detail
- Keyboard navigation (arrow keys in list, Enter to select)
- Loading skeleton show/hide
- Empty state handling
- Search clear button
- All content rendered via `textContent` (never `innerHTML` for plugin data)
- `aria-selected` management on list items
- Auto-select first plugin on initial load

**Critical XSS rule:** All plugin metadata (names, descriptions, commands) MUST use `textContent` or `createElement` + `textContent`. Never `innerHTML` with interpolated data.

- [ ] **Step 2: Commit**

```bash
git add ui/app.js
git commit -m "feat: frontend SPA — plugin list, detail panel, search, filters, keyboard nav"
```

---

### Task 11: Skill Definition

**Files:**
- Create: `skills/open/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/open/SKILL.md`:

```markdown
---
name: open
description: "Open the Plugin Manager UI in the browser. Use when the user wants to manage, view, toggle, or configure Claude Code plugins through a visual interface."
allowed-tools: [Bash, Read]
---

# Open Plugin Manager

Launch the Plugin Manager web UI in the user's browser.

## Steps

1. **Check if server is already running:**

Read the file `~/.claude/plugins/plugin-manager.json`. If it exists, check if the PID in it is still alive. Use the appropriate command for the user's OS:
- **Linux/macOS:** `kill -0 <pid> 2>/dev/null && echo "alive" || echo "dead"`
- **Windows:** `tasklist /FI "PID eq <pid>" 2>NUL | findstr <pid> >NUL && echo alive || echo dead`

2. **If alive:** Tell the user the Plugin Manager is already running and provide the URL: `http://localhost:<port>` (they'll need to open it in their browser — the token was already exchanged).

3. **If dead or file doesn't exist:** Start the server:
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/server.js" &
```

Read the first line of output — it's a JSON object with `url` and `port`.

4. **Tell the user** to open the URL in their browser. The URL includes a one-time auth token.

## Notes
- The server auto-exits after 30 minutes of inactivity
- The server binds to localhost only (127.0.0.1)
- Changes made in the UI take effect on the next Claude Code session
```

- [ ] **Step 2: Commit**

```bash
git add skills/
git commit -m "feat: /plugin-manager:open skill definition"
```

---

### Task 12: Build, Test, and Verify

- [ ] **Step 1: Install dependencies and build**

```bash
npm install && npm run build
```

Expected: `dist/` directory with compiled JS + `dist/ui/` with HTML/CSS/JS

- [ ] **Step 2: Start server and open in browser**

```bash
node dist/server.js
```

Copy the URL from output, open in browser. Verify:
- Auth cookie exchange works (redirected to clean URL)
- Plugin list loads on the left
- Clicking a plugin shows details on the right
- Search filters the list
- Source/Status dropdowns filter correctly
- Dark mode works (if OS is in dark mode)
- 403 page shows for expired/invalid token

- [ ] **Step 3: Verify all plugins are scanned**

Check that all 35 installed plugins appear in the list. Verify:
- `superpowers` shows skills, agents, commands, hooks
- `claude-mem` shows MCP servers, modes
- `playwright` shows MCP server (stdio type inferred)
- Official/Community badges are correct
- Enabled/Disabled status is correct

- [ ] **Step 4: Test edge cases**

- Search for "brainstorm" → should find superpowers (skill name match)
- Filter to "Community" → should show claude-mem, ui-ux-pro-max
- Filter to "Disabled" → should show ui-ux-pro-max (not in enabledPlugins)
- Resize browser below 900px → responsive layout activates

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Plugin Manager Phase 1 complete — read-only viewer with Anthropic UI"
```

---

## Verification Checklist

After all tasks, confirm:

- [ ] `npm run build` succeeds with no errors
- [ ] Server starts and prints startup JSON
- [ ] Browser shows plugin list with all 35 plugins
- [ ] Plugin detail panel shows skills, agents, commands, hooks, MCP servers, modes, CLAUDE.md
- [ ] Search works across name, description, skill names
- [ ] Filters work (Official/Community, Enabled/Disabled)
- [ ] Dark mode renders correctly
- [ ] Keyboard navigation works (arrow keys, Enter, Tab)
- [ ] 403 page appears for invalid/expired tokens
- [ ] Server exits cleanly on Ctrl+C
- [ ] `/plugin-manager:open` skill file is present and correct
