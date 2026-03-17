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
