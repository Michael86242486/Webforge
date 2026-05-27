import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { logger } from "../lib/logger.js";

const execAsync = promisify(exec);

export interface DependencyResult {
  success: boolean;
  output: string;
  duration: number;
  retries: number;
}

const MAX_RETRIES = 3;
const INSTALL_TIMEOUT_MS = 180_000;

async function runInstall(command: string, cwd: string, attempt: number): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    logger.info({ command, cwd, attempt }, "DependencyEngine: running install");
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: INSTALL_TIMEOUT_MS,
      env: {
        ...process.env,
        NODE_ENV: "development",
        npm_config_loglevel: "warn",
        DISABLE_OPENCOLLECTIVE: "1",
        ADBLOCK: "1",
      },
    });
    return { stdout, stderr, ok: true };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "Unknown error", ok: false };
  }
}

export async function installNodeDependencies(workDir: string): Promise<DependencyResult> {
  const start = Date.now();
  let retries = 0;
  let lastOutput = "";

  const pkgPath = path.join(workDir, "package.json");
  try {
    await fs.access(pkgPath);
  } catch {
    return { success: false, output: "No package.json found", duration: 0, retries: 0 };
  }

  const commands = [
    "npm install --prefer-offline 2>&1",
    "npm install --legacy-peer-deps 2>&1",
    "npm install --force 2>&1",
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    retries = attempt;
    const cmd = commands[Math.min(attempt, commands.length - 1)]!;
    const result = await runInstall(cmd, workDir, attempt + 1);
    lastOutput = result.stdout + result.stderr;

    if (result.ok) {
      const duration = Date.now() - start;
      logger.info({ workDir, attempt: attempt + 1, duration }, "DependencyEngine: npm install succeeded");
      return { success: true, output: lastOutput.slice(-2000), duration, retries };
    }

    logger.warn({ workDir, attempt: attempt + 1, error: lastOutput.slice(-500) }, "DependencyEngine: npm install failed, retrying");

    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  return {
    success: false,
    output: `Install failed after ${MAX_RETRIES} attempts:\n${lastOutput.slice(-2000)}`,
    duration: Date.now() - start,
    retries,
  };
}

export async function installPythonDependencies(workDir: string): Promise<DependencyResult> {
  const start = Date.now();

  const reqPath = path.join(workDir, "requirements.txt");
  try {
    await fs.access(reqPath);
  } catch {
    return { success: false, output: "No requirements.txt found", duration: 0, retries: 0 };
  }

  const result = await runInstall(
    "pip install -r requirements.txt --quiet 2>&1",
    workDir,
    1,
  );

  const duration = Date.now() - start;
  if (result.ok) {
    logger.info({ workDir, duration }, "DependencyEngine: pip install succeeded");
    return { success: true, output: (result.stdout + result.stderr).slice(-2000), duration, retries: 0 };
  }

  logger.warn({ workDir, error: result.stderr.slice(-500) }, "DependencyEngine: pip install failed");
  return { success: false, output: (result.stdout + result.stderr).slice(-2000), duration, retries: 0 };
}

export async function autoDetectAndInstall(workDir: string): Promise<DependencyResult> {
  const hasPkg = await fs.access(path.join(workDir, "package.json")).then(() => true).catch(() => false);
  const hasReq = await fs.access(path.join(workDir, "requirements.txt")).then(() => true).catch(() => false);

  if (hasPkg) return installNodeDependencies(workDir);
  if (hasReq) return installPythonDependencies(workDir);

  return { success: false, output: "No package.json or requirements.txt found", duration: 0, retries: 0 };
}

export async function extractAndInstallMissingPackages(workDir: string, code: string): Promise<string[]> {
  const packages = new Set<string>();
  const cjsMatches = code.matchAll(/require\(['"]([^./'"@][^'"]*)['"]\)/g);
  for (const m of cjsMatches) {
    const pkg = m[1]?.split("/")[0];
    if (pkg) packages.add(pkg);
  }
  const esmMatches = code.matchAll(/from ['"]([^./'"@][^'"]*)['"]/g);
  for (const m of esmMatches) {
    const pkg = m[1]?.split("/")[0];
    if (pkg) packages.add(pkg);
  }

  const builtins = new Set(["fs","path","http","https","os","net","crypto","stream","util","events","url","querystring","child_process","process","buffer","assert","readline","timers","perf_hooks","cluster","worker_threads","v8","vm","module","console","global"]);
  const toInstall = [...packages].filter(p => !builtins.has(p));

  if (toInstall.length === 0) return [];

  try {
    await execAsync(`npm install ${toInstall.join(" ")} --save 2>&1`, {
      cwd: workDir,
      timeout: INSTALL_TIMEOUT_MS,
    });
    logger.info({ workDir, packages: toInstall }, "DependencyEngine: installed missing packages");
  } catch (err) {
    logger.warn({ err, packages: toInstall }, "DependencyEngine: failed to install missing packages");
  }

  return toInstall;
}
