# Claude Plugin Manager — Design Specification v2

## Overview

A Claude Code plugin that provides a visual web UI for managing, configuring, and browsing Claude Code plugins. Uses a **skill-only architecture** — no always-on MCP server. The HTTP server starts on-demand when the user invokes `/plugin-manager:open`.

## Key Decisions

- **Scope:** Full configurator — view, toggle, configure, browse marketplace
- **Architecture:** Skill-only plugin + standalone HTTP server (no MCP server)
- **Launch:** `/plugin-manager:open` skill instructs Claude to start HTTP server via Bash
- **UI layout:** Master-Detail — plugin list left, detail panel right
- **Visual style:** Anthropic brand — terracotta accents, warm parchment backgrounds
- **Tech stack:** TypeScript HTTP server (compiled to JS), Vanilla JS frontend
- **Dependencies:** Minimal — Node.js built-in `http` + `fs` + `path` + `crypto`

## Architecture

### Skill-Only + On-Demand HTTP Server

No MCP server. No always-on process. The plugin contains:
1. A **skill** (`/plugin-manager:open`) that tells Claude how to start the server
2. A **compiled Node.js HTTP server** that starts on-demand and serves both API + UI

```
User: /plugin-manager:open
  → Claude reads SKILL.md instructions
  → Claude runs: node <plugin-root>/dist/server.js
  → Server starts, prints JSON: {"url":"http://localhost:PORT?token=xyz"}
  → Claude tells user to open the URL
  → Server auto-exits after 30min idle or when terminal closes
```

This avoids:
- MCP stdout contamination risk
- Startup lag on every Claude Code session
- Complexity of MCP + HTTP coexistence

### Server States

```
[Not Running] --(/plugin-manager:open)--> [Running]
[Running] --(30min idle / terminal close)--> [Not Running]
```

State is tracked via `~/.claude/plugins/plugin-manager.json`:
```json
{ "port": 54321, "pid": 12345, "tokenHash": "sha256...", "startedAt": "2026-03-17T..." }
```

On startup, if this file exists, the server checks if the PID is alive. If alive, returns existing URL. If dead, overwrites and starts fresh.

### Path Handling

All `~/.claude/` references are shorthand for `path.join(os.homedir(), '.claude', ...)`. Path construction uses Node.js `path.join()` for cross-platform compatibility.

## Data Sources

| File | Purpose |
|---|---|
| `~/.claude/plugins/installed_plugins.json` | Plugin installations (version 2 format) |
| `~/.claude/settings.json` | `enabledPlugins` map, `extraKnownMarketplaces`, `effortLevel` |
| `~/.claude/settings.local.json` | Permissions (allow/deny/ask rules) |
| `~/.claude/plugins/known_marketplaces.json` | Marketplace sources with `installLocation` |
| `~/.claude/plugins/cache/<source>/<plugin>/<version>/` | Plugin files |
| `~/.claude/plugins/marketplaces/<name>/plugins/` | Marketplace plugin directories |

### installed_plugins.json — Real Schema

```typescript
interface InstalledPluginsFile {
  version: 2;
  plugins: Record<string, PluginInstallation[]>;  // key = "name@source"
}

interface PluginInstallation {
  scope: 'user' | 'project' | 'local';
  projectPath?: string;          // only for scope === 'local'
  installPath: string;           // absolute path to plugin files
  version: string;               // semver or git commit SHA
  installedAt: string;           // ISO date
  lastUpdated: string;           // ISO date
  gitCommitSha: string;          // full commit hash
}
```

**Key facts:**
- Plugin ID (e.g. `superpowers@claude-plugins-official`) is the map KEY, not a field
- `name` and `source` are parsed from the key: `key.split('@')` → `[name, source]`
- Each plugin maps to an ARRAY (same plugin can be installed at multiple scopes)
- `enabled` status lives in `settings.json`, NOT here — must be merged
- `sourceType` is inferred: `source === 'claude-plugins-official'` → official, else community

## Data Model

```typescript
// Merged model for UI consumption
interface PluginInfo {
  id: string;                        // "superpowers@claude-plugins-official" (from map key)
  name: string;                      // "superpowers" (parsed from key)
  source: string;                    // "claude-plugins-official" (parsed from key)
  isOfficial: boolean;               // inferred from source
  enabled: boolean;                  // from settings.json enabledPlugins
  installations: PluginInstallation[]; // may have multiple scopes

  // From .claude-plugin/plugin.json manifest:
  description?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];

  // Scanned from plugin files (using installPath of primary installation):
  skills: SkillInfo[];
  agents: AgentInfo[];
  commands: CommandInfo[];
  hooks: HookInfo[];
  mcpServers: McpServerInfo[];
  modes: ModeInfo[];
  hasClaudeMd: boolean;              // whether CLAUDE.md exists at plugin root
  claudeMdPreview?: string;          // first 500 chars of CLAUDE.md

  // Error state:
  error?: string;                    // set if plugin dir is corrupted/unreadable
}

interface SkillInfo {
  name: string;
  description: string;
  userInvocable: boolean;
  modelInvocable: boolean;
}

interface AgentInfo {
  name: string;
  description: string;
  model?: string;                    // from frontmatter, may be absent
  color?: string;
}

interface CommandInfo {
  name: string;                      // filename without .md
  description: string;
  argumentHint?: string;
}

interface HookInfo {
  event: string;                     // SessionStart, PostToolUse, etc.
  matcher?: string;
  type: string;                      // "command"
  command: string;
  async?: boolean;
  timeout?: number;
}

interface McpServerInfo {
  name: string;
  type?: 'stdio' | 'http';          // optional — inferred: stdio if command present, http if url present
  command?: string;
  args?: string[];
  url?: string;
}

interface ModeInfo {
  name: string;                      // filename without .json
  slug?: string;
}
```

### Scanner Logic

1. Read `installed_plugins.json` → iterate `Object.entries(data.plugins)`
2. For each `[key, installations]`:
   - Parse `name` and `source` from key
   - Pick primary installation (prefer `user` scope, then first entry)
   - Read `enabled` from `settings.json.enabledPlugins[key]` (missing = disabled)
3. Read plugin manifest from `<installPath>/.claude-plugin/plugin.json`
   - Fallback to `<installPath>/package.json` for `name`, `version`, `description`
4. Scan directories at `installPath`:
   - `skills/*/SKILL.md` → parse YAML frontmatter
   - `agents/*.md` → parse YAML frontmatter
   - `commands/*.md` → parse YAML frontmatter
   - `hooks/hooks.json` → file has top-level `{ "hooks": { EventName: [...] } }` wrapper (may also have `"description"` key — ignore it). Each event maps to array of matcher-groups: `{ matcher?: string, hooks: [{ type, command, timeout? }] }`. Flatten by copying group's `matcher` to each inner hook entry.
   - `.mcp.json` → handle BOTH formats (wrapped `mcpServers` and flat top-level)
   - `modes/*.json` → list mode files
   - `CLAUDE.md` → check existence, read preview
5. On parse error for any file → set `error` field, continue with partial data

### YAML Frontmatter Parser

Skills, agents, and commands use YAML frontmatter in markdown files:
```markdown
---
name: skill-name
description: what it does
---
Content...
```

Parser strategy: simple line-by-line parser for `key: value` pairs between `---` delimiters. No nesting needed. This avoids a YAML library dependency. Limitations: no multi-line values, no arrays, no nested objects. These are acceptable — real frontmatter in plugins uses only simple key-value pairs.

### .mcp.json Format Handling

Two formats exist in the wild. Scanner handles both:

```typescript
// Format A: wrapped in "mcpServers"
{ "mcpServers": { "server-name": { "command": "...", "args": [...] } } }

// Format B: flat top-level
{ "server-name": { "command": "...", "args": [...] } }

// Detection: if top-level has "mcpServers" key → Format A, else Format B
```

## HTTP API

### Security

- **Bind:** `127.0.0.1` only (no external access)
- **Auth token:** 32-byte random hex generated at startup. Passed to browser via URL query param on first load only.
- **Token exchange:** On first request with `?token=xyz`, server validates token, sets `HttpOnly; SameSite=Strict; Path=/` cookie with unique name (`pm-<port>`) to avoid cross-service leakage, then redirects to clean URL (server sends 302 to strip query param from browser history). The URL token is **one-time-use** — invalidated after successful exchange. All subsequent requests authenticate via cookie. Raw token is never stored on disk — only its SHA-256 hash is written to `plugin-manager.json`.
- **Host header validation:** Reject requests where `Host` is not `127.0.0.1:PORT` or `localhost:PORT` (DNS rebinding defense).
- **Content-Type enforcement:** Mutating endpoints (POST, PUT) require `Content-Type: application/json`. Rejects form submissions (CSRF defense).
- **XSS prevention:** All dynamic content rendered via `textContent`, never `innerHTML`. Plugin metadata is untrusted input.
- **Path traversal defense:** Plugin IDs validated against strict pattern: `/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+$/`. Reject any ID with `.`, `/`, `\`, or null bytes. After path construction, verify resolved path starts with expected base directory.
- **File permissions:** `plugin-manager.json` written with mode `0600` (owner-only).

### Plugin ID in URLs

Plugin IDs contain `@` which must be URL-encoded (`%40`) in path params. The router decodes path segments with `decodeURIComponent()` **exactly once** (at route matching time, not again in handlers) then validates against the strict pattern above. Double-decode attacks (e.g. `%2540` → `%40` → `@`) are prevented by this single-decode policy.

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | — | Serve index.html (+ set auth cookie on first visit) |
| `GET /styles.css` | — | Serve CSS |
| `GET /app.js` | — | Serve JS |
| `GET /api/health` | GET | `{ status: "ok", uptime: N, pluginCount: N }` |
| `GET /api/plugins` | GET | List all plugins. Query: `?filter=enabled&source=official&q=search&sort=name&limit=50&offset=0` |
| `GET /api/plugins/:id` | GET | Full plugin details |
| `POST /api/plugins/:id/toggle` | POST | Toggle enabled/disabled. Body: `{ enabled: boolean }` |
| `GET /api/settings` | GET | Current settings (sanitized — no secrets) |
| `PATCH /api/settings` | PATCH | Partial update. Body: `{ path: string, value: validated }` |
| `GET /api/marketplace` | GET | Available plugins from known marketplaces |
| `GET /api/events` | SSE | Server-Sent Events for live updates (requires cookie auth, same as all endpoints) |

### Search

`GET /api/plugins?q=brainstorm` searches across:
- Plugin name
- Plugin description
- Skill names and descriptions
- Agent names and descriptions
- Command names

### Settings Write Rules

`PATCH /api/settings` validates both the path AND the value:

| Path | Target File | Value Schema |
|---|---|---|
| `enabledPlugins.<id>` | `settings.json` | `boolean` — **enable: set `true`; disable: DELETE the key** (Claude Code treats missing key as disabled, not `false`) |
| `effortLevel` | `settings.json` | `"low" \| "medium" \| "high"` |
| `permissions.allow` | `settings.local.json` | `string[]` matching pattern `Tool(args)` |
| `permissions.deny` | `settings.local.json` | `string[]` |

All other paths → `400 Bad Request`.

**Important limitation:** Changes to `settings.json` and `settings.local.json` take effect on the **next Claude Code session**, not immediately. The UI must show a clear notice: "Changes will apply when you restart Claude Code."

### File Write Strategy

1. Read current file content
2. Parse JSON, apply change
3. Write to `<filename>.tmp` (same directory)
4. On Windows: try `fs.rename`. On `EEXIST`, `fs.unlink` target then `fs.rename`
5. On success: write backup to `<filename>.bak` (previous version)
6. On parse error of existing file: attempt restore from `.bak`

**Concurrency:** Single write queue in the server process (serialized via async mutex). Prevents race conditions between concurrent HTTP requests. Cannot prevent races with external writers (Claude Code itself), but backup + atomic rename minimizes corruption risk.

### Error Responses

```json
{ "error": "Plugin not found", "code": "PLUGIN_NOT_FOUND" }
```

| Status | When |
|---|---|
| `400` | Invalid input, unknown settings path, schema validation failure |
| `403` | Missing/invalid auth cookie, bad Host header |
| `404` | Plugin or resource not found |
| `500` | Internal error (filesystem, parse failure) |

## UI Design

### Color Palette

**Light mode (default):**

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F5EEE6` | Page background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--surface-hover` | `#F9F4ED` | List item hover |
| `--surface-active` | `#F0E8DD` | Selected item bg |
| `--header` | `#191919` | Top bar |
| `--primary` | `#D97757` | Buttons, active states |
| `--primary-hover` | `#C4684A` | Button hover |
| `--primary-subtle` | `rgba(217,119,87,0.08)` | Selected item tint, badge bg |
| `--border` | `#E6DDD1` | Dividers |
| `--border-strong` | `#D4C9BC` | Focus input borders |
| `--text` | `#191919` | Primary text |
| `--text-secondary` | `#5A5048` | Descriptions (WCAG AA compliant) |
| `--text-tertiary` | `#9B8E82` | Timestamps, version numbers |
| `--success` | `#2D9D5E` | Enabled status |
| `--danger` | `#D14343` | Remove, destructive |
| `--muted` | `#B5A999` | Disabled status (paired with text label) |
| `--focus-ring` | `rgba(217,119,87,0.4)` | Keyboard focus outline |

**Dark mode** (via `@media (prefers-color-scheme: dark)`):

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F5EEE6` | `#1A1A1A` |
| `--surface` | `#FFFFFF` | `#242424` |
| `--header` | `#191919` | `#141414` |
| `--text` | `#191919` | `#ECECEC` |
| `--text-secondary` | `#5A5048` | `#9B9B9B` |
| `--border` | `#E6DDD1` | `#333333` |
| `--primary` | `#D97757` | `#E08B6A` |
| `--surface-hover` | `#F9F4ED` | `#2C2C2C` |

### Typography

```css
--font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, monospace;
```

| Element | Size | Weight | Notes |
|---|---|---|---|
| Plugin name (detail) | 1.25rem | 600 | |
| Section headers | 0.8125rem | 600 | uppercase, tracking 0.05em |
| Body / descriptions | 0.875rem | 400 | line-height 1.5 |
| Metadata / timestamps | 0.75rem | 400 | |
| Plugin name (list) | 0.875rem | 500 | |
| Badge text | 0.6875rem | 500 | |

### Icons

Lucide icons, inline SVG (~15 icons total). 16px in list, 18px in detail headers. `currentColor` fill.

| Element | Icon |
|---|---|
| Search | `Search` |
| Settings | `Settings` |
| Skills | `Zap` |
| Agents | `Bot` |
| Commands | `Terminal` |
| Hooks | `Webhook` |
| MCP Servers | `Server` |
| Modes | `Palette` |
| Expand/collapse | `ChevronRight` → `ChevronDown` |
| External link | `ExternalLink` |
| CLAUDE.md | `FileText` |

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  ◉ Claude Plugin Manager                   🔍 Search  ⚙ │
├────────────────┬─────────────────────────────────────────┤
│  [Search...]   │                                         │
│  ──────────────│  superpowers                   v5.0.4   │
│  Filters:      │  Brainstorming, planning, TDD...        │
│  [Source ▾]    │  by Anthropic • Official                 │
│  [Status ▾]   │                                         │
│  ──────────────│  [● Enabled]  [Update]  [Remove]        │
│                │                                         │
│  ● superpow..  │  ⚡ Skills (12)              ▸          │
│    claude-mem  │  🤖 Agents (1)               ▸          │
│    pr-review.. │  ⌨  Commands (3)             ▸          │
│    playwright  │  🔗 Hooks (2)                ▸          │
│    feature-d.  │  📄 CLAUDE.md                ▸          │
│    ...         │                                         │
│                │  ⚠ Changes apply on next session        │
├────────────────┴─────────────────────────────────────────┤
│  Plugin Manager v1.0.0 • 35 installed                    │
└──────────────────────────────────────────────────────────┘
```

### Left Panel (280px)

- **Search + Filters** at TOP (not bottom)
- Search matches name, description, skill names
- Plugin list with status dot + name (single line, ellipsis)
- Selected: 3px left border `--primary`, bg `--primary-subtle`
- Hover: `--surface-hover`, 150ms transition
- Custom scrollbar: 4px wide, `--border` color, visible on hover only
- **Grouping option:** Official / Community collapsible groups

### Right Panel (flexible)

- **Header:** Plugin name (1.25rem), version, description (first line)
- **Author line:** "by Name • Official/Community" with badge
- **Action bar:** Toggle switch + label, Update button (Phase 3), Remove button (Phase 3)
- **Collapsible sections:** Only shown if non-empty. First non-empty auto-expanded.
  - Each header: icon + name (uppercase label) + count badge + chevron
  - Skills/Agents/Commands: table with name and description
  - Hooks: grouped by event name
  - MCP Servers: name, type, command
  - CLAUDE.md: preview with expand to full content
  - Permissions: read-only list from settings.local.json
  - Installation info: scope(s), install date, git SHA (collapsed by default)
- **Session restart notice:** Subtle banner after any toggle/settings change

### Components

**Toggle Switch:**
- Track: 36px × 20px, rounded (9999px)
- Off: `--border` bg, white thumb
- On: `--primary` bg, white thumb
- Transition: 200ms cubic-bezier(0.4, 0, 0.2, 1)
- Thumb: 16px circle, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`
- Label "Enabled" / "Disabled" to the right
- `role="switch"`, `aria-checked`

**Badges:**
- Official: `--primary-subtle` bg, `--primary` text, 4px radius
- Community: `--border` bg, `--text-secondary` text
- Invocable: `--success` at 10% opacity bg, `--success` text

**Toast Notifications:**
- Position: bottom-center, 24px from bottom
- Max width: 400px
- Style: `--surface` bg, `--border` 1px, 8px radius
- Left accent: 3px border in status color
- Auto-dismiss: 4s. Manual X button
- Animation: slide up + fade in (250ms ease-out)

**Confirmation Dialogs:**
- Centered modal, `--surface` bg, 12px radius
- Backdrop: `rgba(0,0,0,0.4)`, `backdrop-filter: blur(2px)`
- Buttons: "Cancel" ghost + action button in `--danger`

**Loading States:**
- Initial: skeleton shimmer (6-8 bars, 1.5s ease infinite)
- Toggle: 16px spinner replacing switch during API call
- Detail panel: skeleton for header + 3 section placeholders

**Empty States:**
- No plugins: centered message "No plugins installed" + install instructions
- No search results: "No plugins match [query]" with reset link
- No selection: "Select a plugin to view details" (centered, muted text)

**Session Expired (403):**
- Friendly page: "Session expired. Reopen from Claude Code using `/plugin-manager:open`"

### Accessibility

- **Keyboard nav:** Arrow keys for list, Tab for panel focus, Enter to select, Escape on mobile overlay
- **ARIA:** `role="listbox"` on plugin list, `role="option"` on items, `role="switch"` on toggles
- **Focus ring:** 2px outline using `--focus-ring` on all interactive elements
- **Status:** Text labels alongside color indicators ("● Enabled" / "○ Disabled")
- **aria-live="polite"** on search results count and toggle confirmations
- **Color contrast:** All text meets WCAG AA 4.5:1 minimum

### Responsive

- Below 900px: detail panel slides over list with back arrow
- Above 900px: side-by-side
- Left panel: 30% width, min 240px, max 350px (not fixed 300px)

### Page Meta

- Title: "Plugin Manager — Claude Code"
- Favicon: inline SVG data URI (terracotta Anthropic-style mark)

## Skill Definition

### /plugin-manager:open

```yaml
---
name: open
description: "Open the Plugin Manager UI in the browser. Use when the user
  wants to manage, view, toggle, or configure Claude Code plugins through
  a visual interface."
allowed-tools: [Bash, Read]
---
```

**Instructions in SKILL.md:**
1. Check if server is already running: read `~/.claude/plugins/plugin-manager.json`, check if PID is alive
2. If running: return existing URL
3. If not running: start server via `node <plugin-root>/dist/server.js` (background process)
4. Read the startup JSON output to get URL
5. Tell user to open the URL in their browser

## Project Structure

```
claude-plugin-manager/
├── .claude-plugin/
│   └── plugin.json                # { name: "plugin-manager", version: "1.0.0", ... }
├── skills/
│   └── open/
│       └── SKILL.md               # /plugin-manager:open
├── src/
│   ├── server.ts                  # Entry: starts HTTP server, prints startup JSON
│   ├── router.ts                  # Lightweight URL router with path params
│   ├── auth.ts                    # Token generation, cookie exchange, validation
│   ├── plugin-scanner.ts          # Reads all plugin data from filesystem
│   ├── plugin-config.ts           # Writes settings with atomic write + mutex
│   ├── marketplace.ts             # Reads marketplace directories
│   ├── frontmatter.ts             # Simple key:value YAML frontmatter parser
│   └── types.ts                   # All TypeScript interfaces
├── ui/
│   ├── index.html                 # SPA shell with inline favicon
│   ├── styles.css                 # Full Anthropic theme (light + dark)
│   └── app.js                     # Vanilla JS frontend
├── package.json                   # scripts: { build: "tsc", start: "node dist/server.js" }
├── tsconfig.json                  # target: ES2020, module: commonjs, outDir: dist
└── .gitignore
```

**Build:** `tsc` compiles `src/` → `dist/`. UI files copied to `dist/ui/` via build script.
**Distribution:** Plugin ships with pre-compiled `dist/` directory. No build step needed for end users.

## Implementation Phases

### Phase 1 — Read-Only Viewer
- Project scaffolding (package.json, tsconfig, plugin manifest)
- `frontmatter.ts` — simple YAML frontmatter parser
- `plugin-scanner.ts` — read installed_plugins.json (v2 format), settings.json, scan plugin dirs for skills/agents/commands/hooks/modes/MCP/.claude-plugin/CLAUDE.md
- `router.ts` — lightweight HTTP router with path params + query parsing
- `auth.ts` — token generation, cookie exchange, Host validation
- `server.ts` — HTTP server with idle timeout, startup JSON output
- HTTP endpoints: `GET /api/health`, `GET /api/plugins`, `GET /api/plugins/:id`
- UI: Master-detail layout, plugin list, detail panel, search, filters, dark mode
- UI: Loading skeletons, empty states, 403 page
- Skill: `/plugin-manager:open`
- Build pipeline: tsc + copy UI files

### Phase 2 — Toggle & Settings
- `plugin-config.ts` — atomic write with mutex, backup, Windows rename handling
- HTTP endpoints: `POST /api/plugins/:id/toggle`, `GET /api/settings`, `PATCH /api/settings`
- `GET /api/events` — SSE for live updates (fs.watch on settings files)
- UI: Toggle switches with optimistic update, settings page, toast notifications
- UI: Session restart notice banner, confirmation dialogs
- Value validation per settings path

### Phase 3 — Marketplace & Management
- `marketplace.ts` — scan marketplace installLocations, list available plugins
- HTTP: `GET /api/marketplace`
- UI: Marketplace view, available plugins, version comparison (semver + SHA)
- UI: Update button (compare installed vs marketplace versions)
- UI: Remove button with confirmation dialog
