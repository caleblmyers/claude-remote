import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export interface RepoTemplate {
  name: string;
  prompt: string;
  trustLevel?: {
    autoApprove?: string[];
    alwaysAsk?: string[];
    deny?: string[];
  };
}

export interface RepoConfig {
  name: string;
  path: string;
  templates?: RepoTemplate[];
  defaultTrustPreset?: "observe" | "code" | "auto";
}

export interface TrustLevelConfig {
  autoApprove: string[];
  alwaysAsk: string[];
  deny: string[];
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  mailto?: string;
}

export interface CorsConfig {
  allowedOrigins: string[];
}

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  auth: {
    secret: string;
  };
  cors: CorsConfig;
  vapid?: VapidConfig;
  repos: RepoConfig[];
  globalTemplates: RepoTemplate[];
  defaults: {
    trustLevel: TrustLevelConfig;
    notifications: {
      onComplete: boolean;
      onError: boolean;
      onPermission: boolean;
    };
  };
}

const CONFIG_FILENAME = "claude-remote.config.yaml";

function findConfigPath(): string {
  // Walk up from cwd to find the config file
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: next to the backend directory
  return path.resolve(__dirname, "../../..", CONFIG_FILENAME);
}

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const configPath = findConfigPath();

  let config: AppConfig;
  if (!fs.existsSync(configPath)) {
    console.warn(
      `Config file not found at ${configPath}. Using defaults.`
    );
    config = defaultConfig();
  } else {
    const raw = fs.readFileSync(configPath, "utf-8");
    config = yaml.load(raw) as AppConfig;
    console.log(`Config loaded from ${configPath}`);
  }

  // Environment variable overrides
  if (process.env.CLAUDE_REMOTE_AUTH_SECRET) {
    config.auth.secret = process.env.CLAUDE_REMOTE_AUTH_SECRET;
  }
  if (process.env.CLAUDE_REMOTE_CORS_ORIGINS) {
    config.cors = {
      allowedOrigins: process.env.CLAUDE_REMOTE_CORS_ORIGINS.split(",").map((s) => s.trim()),
    };
  }
  // Ensure cors config exists (for configs loaded from older yaml files)
  if (!config.cors) {
    config.cors = { allowedOrigins: [] };
  }
  if (process.env.CLAUDE_REMOTE_VAPID_PUBLIC_KEY && process.env.CLAUDE_REMOTE_VAPID_PRIVATE_KEY) {
    config.vapid = {
      publicKey: process.env.CLAUDE_REMOTE_VAPID_PUBLIC_KEY,
      privateKey: process.env.CLAUDE_REMOTE_VAPID_PRIVATE_KEY,
      mailto: process.env.CLAUDE_REMOTE_VAPID_MAILTO ?? config.vapid?.mailto,
    };
  }

  // Refuse to start with the default auth secret
  const DEFAULT_SECRETS = ["change-me-before-use", "change-me-to-a-random-string"];
  if (DEFAULT_SECRETS.includes(config.auth.secret)) {
    console.error(
      "\n" +
      "ERROR: You must set a real auth secret before running Claude Remote.\n" +
      "  Option 1: Set CLAUDE_REMOTE_AUTH_SECRET environment variable\n" +
      "  Option 2: Change auth.secret in your claude-remote.config.yaml\n" +
      "  Generate one with: openssl rand -hex 32\n"
    );
    process.exit(1);
  }

  _config = config;
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig();
  return _config;
}

/** Reload config from disk (used after saving changes). */
export function reloadConfig(): AppConfig {
  _config = null;
  return loadConfig();
}

/** Merge partial updates into the config and write back to disk. */
export function updateConfig(updates: Record<string, unknown>): AppConfig {
  const current = getConfig();

  // Merge top-level fields
  if (updates.repos !== undefined) current.repos = updates.repos as RepoConfig[];
  if (updates.globalTemplates !== undefined)
    current.globalTemplates = updates.globalTemplates as RepoTemplate[];
  if (updates.defaults !== undefined)
    current.defaults = updates.defaults as AppConfig["defaults"];

  // Save to file — exclude secrets from the written config if they came from env vars
  const configPath = findConfigPath();
  const yamlStr = yaml.dump(current, { lineWidth: 120 });
  fs.writeFileSync(configPath, yamlStr, "utf-8");
  console.log(`Config saved to ${configPath}`);

  _config = current;
  return current;
}

function defaultConfig(): AppConfig {
  return {
    server: { port: parseInt(process.env.PORT || '3001'), host: "0.0.0.0" },
    auth: { secret: "change-me-before-use" },
    cors: { allowedOrigins: [] },
    repos: [],
    globalTemplates: [],
    defaults: {
      trustLevel: {
        autoApprove: ["Read", "Grep", "Glob"],
        alwaysAsk: ["Bash", "Write", "Edit"],
        deny: [],
      },
      notifications: {
        onComplete: true,
        onError: true,
        onPermission: true,
      },
    },
  };
}
