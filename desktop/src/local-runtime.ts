import { randomBytes } from "node:crypto";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export type LocalRuntimeState = "stopped" | "starting" | "ready" | "error";

export interface LocalRuntimeSnapshot {
  state: LocalRuntimeState;
  available: boolean;
  url: string;
  piEnabled: boolean;
  error: string;
}

interface LocalRuntimeOptions {
  appPath: string;
  executablePath: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
}

interface RuntimePaths {
  python: string;
  backendRoot: string;
  piCli: string;
  piChromeExtension: string;
  connectorExtension: string;
}

const HEALTH_ATTEMPTS = 60;
const HEALTH_INTERVAL_MS = 250;

export class LocalRuntimeManager {
  private child: ChildProcess | null = null;
  private snapshotValue: LocalRuntimeSnapshot = {
    state: "stopped",
    available: false,
    url: "",
    piEnabled: false,
    error: ""
  };
  private starting: Promise<LocalRuntimeSnapshot> | null = null;
  private stopping = false;

  constructor(private readonly options: LocalRuntimeOptions) {}

  snapshot(): LocalRuntimeSnapshot {
    return { ...this.snapshotValue };
  }

  start(): Promise<LocalRuntimeSnapshot> {
    if (this.starting) return this.starting;
    if (this.child && this.snapshotValue.state === "ready") return Promise.resolve(this.snapshot());
    this.starting = this.startInternal().finally(() => { this.starting = null; });
    return this.starting;
  }

  stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
          timeout: 5_000
        });
      } else {
        child.kill();
      }
    }
    this.snapshotValue = {
      state: "stopped",
      available: false,
      url: "",
      piEnabled: false,
      error: ""
    };
  }

  private async startInternal(): Promise<LocalRuntimeSnapshot> {
    this.stopping = false;
    this.snapshotValue = {
      state: "starting",
      available: false,
      url: "",
      piEnabled: true,
      error: ""
    };
    try {
      const paths = this.resolvePaths();
      if (this.options.isPackaged) {
        await Promise.all([
          assertFile(paths.python),
          assertFile(paths.piCli),
          assertFile(paths.connectorExtension),
          assertFile(path.join(paths.backendRoot, "go_backend", "server.py"))
        ]);
      }

      const port = await reserveLoopbackPort();
      const url = `http://127.0.0.1:${port}`;
      const dataRoot = path.join(this.options.userDataPath, "runtime");
      await mkdir(dataRoot, { recursive: true });
      const env = runtimeEnvironment({
        paths,
        url,
        port,
        dataRoot,
        executablePath: this.options.executablePath
      });

      const child = spawn(paths.python, ["-m", "go_backend.server", "serve", "--port", String(port)], {
        cwd: paths.backendRoot,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.child = child;
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-4_000);
      });
      child.on("exit", (code, signal) => {
        if (this.child === child) this.child = null;
        if (this.stopping) return;
        this.snapshotValue = {
          state: "error",
          available: false,
          url: "",
          piEnabled: true,
          error: sanitizedRuntimeError(stderr || `El runtime terminó (${code ?? signal ?? "desconocido"}).`)
        };
      });
      child.on("error", (error) => {
        if (this.stopping) return;
        this.snapshotValue = {
          state: "error",
          available: false,
          url: "",
          piEnabled: true,
          error: sanitizedRuntimeError(error.message)
        };
      });

      await waitForHealth(url, child);
      this.snapshotValue = {
        state: "ready",
        available: true,
        url,
        piEnabled: true,
        error: ""
      };
    } catch (error) {
      const child = this.child;
      this.child = null;
      if (child && child.exitCode === null && child.signalCode === null) child.kill();
      this.snapshotValue = {
        state: "error",
        available: false,
        url: "",
        piEnabled: true,
        error: sanitizedRuntimeError(error instanceof Error ? error.message : "No se pudo iniciar el runtime local.")
      };
    }
    return this.snapshot();
  }

  private resolvePaths(): RuntimePaths {
    if (this.options.isPackaged) {
      const root = path.join(this.options.resourcesPath, "agentgenia-runtime");
      return {
        python: process.platform === "win32"
          ? path.join(root, "python", "python.exe")
          : path.join(root, "python", "bin", "python3"),
        backendRoot: path.join(root, "backend"),
        piCli: path.join(root, "pi", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
        piChromeExtension: path.join(root, "pi", "node_modules", "pi-chrome", "extensions", "chrome-profile-bridge", "index.ts"),
        connectorExtension: path.join(root, "backend", "extensions", "connectors", "index.ts")
      };
    }
    return {
      python: process.env.AGENTGENIA_PYTHON?.trim() || "python3",
      backendRoot: this.options.appPath,
      piCli: path.join(this.options.appPath, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
      piChromeExtension: path.join(this.options.appPath, "node_modules", "pi-chrome", "extensions", "chrome-profile-bridge", "index.ts"),
      connectorExtension: path.join(this.options.appPath, "extensions", "connectors", "index.ts")
    };
  }
}

function runtimeEnvironment({
  paths,
  url,
  port,
  dataRoot,
  executablePath
}: {
  paths: RuntimePaths;
  url: string;
  port: number;
  dataRoot: string;
  executablePath: string;
}): NodeJS.ProcessEnv {
  const inheritedNames = [
    "ALLUSERSPROFILE", "APPDATA", "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
    "COMSPEC", "HOMEDRIVE", "HOMEPATH", "LANG", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
    "OS", "PATH", "PATHEXT", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)",
    "PUBLIC", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "USERDOMAIN", "USERNAME",
    "USERPROFILE", "WINDIR"
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const name of inheritedNames) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, {
    HOST: "127.0.0.1",
    PORT: String(port),
    ADMIN_TOKEN: randomBytes(32).toString("hex"),
    DB_PATH: path.join(dataRoot, "wrapper.sqlite"),
    SECRET_FILE: path.join(dataRoot, "secret.key"),
    PI_ENABLED: "1",
    PI_BIN: paths.piCli,
    PI_NODE_BIN: executablePath,
    PI_NODE_RUN_AS_ELECTRON: "1",
    PI_BACKEND_URL: url,
    PI_RUNS_DIR: path.join(dataRoot, "pi-runs"),
    PI_CONNECTOR_EXTENSION: paths.connectorExtension,
    PI_CHROME_EXTENSION: paths.piChromeExtension,
    PI_CHROME_ISOLATION: "per_run",
    PI_CHROME_AUTO_AUTHORIZE: "0",
    STRIPE_ENABLED: "0",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GOOGLE_OAUTH_REDIRECT_URI: "",
    PYTHONPATH: paths.backendRoot,
    PYTHONUTF8: "1"
  });
  return env;
}

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("El backend local terminó durante el arranque.");
    }
    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const health = await response.json() as Record<string, unknown>;
        if (
          health.ok === true
          && health.pi_enabled === true
          && health.pi_available === true
          && health.pi_node_available === true
          && health.pi_connectors_available === true
          && health.pi_chrome_extension_installed === true
        ) return;
      }
    } catch {
      // El proceso todavía está importando dependencias o abriendo SQLite.
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
  }
  throw new Error("El backend local no respondió dentro del tiempo esperado.");
}

async function assertFile(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Falta un componente del runtime: ${path.basename(filePath)}`);
  }
}

function sanitizedRuntimeError(message: string): string {
  return message.replace(/[A-Fa-f0-9]{48,}/g, "[redacted]").trim().slice(-1_000);
}
