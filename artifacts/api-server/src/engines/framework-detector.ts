import fs from "fs/promises";
import path from "path";

export type FrameworkType =
  | "html"
  | "react"
  | "nextjs"
  | "vite"
  | "vue"
  | "express"
  | "fastapi"
  | "node"
  | "phaser"
  | "threejs"
  | "fullstack"
  | "unknown";

export interface FrameworkInfo {
  framework: FrameworkType;
  language: "js" | "python" | "unknown";
  startCommand: string;
  buildCommand: string | null;
  installCommand: string;
  envVars: Record<string, string>;
  confidence: number;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  main?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function detectFramework(workDir: string, port: number): Promise<FrameworkInfo> {
  const pkgPath = path.join(workDir, "package.json");
  const reqPath = path.join(workDir, "requirements.txt");
  const mainPy = path.join(workDir, "main.py");
  const indexHtml = path.join(workDir, "index.html");
  const viteCfg = path.join(workDir, "vite.config.js");
  const viteCfgTs = path.join(workDir, "vite.config.ts");
  const nextCfg = path.join(workDir, "next.config.js");
  const nextCfgTs = path.join(workDir, "next.config.ts");
  const nuxtCfg = path.join(workDir, "nuxt.config.js");

  const hasPkg = await fileExists(pkgPath);
  const hasReq = await fileExists(reqPath);
  const hasMainPy = await fileExists(mainPy);
  const hasIndexHtml = await fileExists(indexHtml);
  const hasVite = (await fileExists(viteCfg)) || (await fileExists(viteCfgTs));
  const hasNext = (await fileExists(nextCfg)) || (await fileExists(nextCfgTs));
  const hasNuxt = await fileExists(nuxtCfg);

  const portEnv = String(port);

  if (hasMainPy || hasReq) {
    const reqContent = hasReq ? await fs.readFile(reqPath, "utf8").catch(() => "") : "";
    const isFastAPI = reqContent.includes("fastapi") || reqContent.includes("FastAPI");
    const isDjango = reqContent.includes("django") || reqContent.includes("Django");
    const isFlask = reqContent.includes("flask") || reqContent.includes("Flask");

    if (isFastAPI) {
      return {
        framework: "fastapi",
        language: "python",
        startCommand: `uvicorn main:app --host 0.0.0.0 --port ${port} --reload`,
        buildCommand: null,
        installCommand: "pip install -r requirements.txt",
        envVars: { PORT: portEnv },
        confidence: 95,
      };
    }
    if (isDjango) {
      return {
        framework: "node",
        language: "python",
        startCommand: `python manage.py runserver 0.0.0.0:${port}`,
        buildCommand: null,
        installCommand: "pip install -r requirements.txt",
        envVars: { PORT: portEnv },
        confidence: 90,
      };
    }
    if (isFlask) {
      return {
        framework: "node",
        language: "python",
        startCommand: `python app.py`,
        buildCommand: null,
        installCommand: "pip install -r requirements.txt",
        envVars: { PORT: portEnv, FLASK_RUN_PORT: portEnv, FLASK_RUN_HOST: "0.0.0.0" },
        confidence: 90,
      };
    }
  }

  if (!hasPkg) {
    if (hasIndexHtml) {
      return {
        framework: "html",
        language: "js",
        startCommand: `npx serve . -p ${port} -s`,
        buildCommand: null,
        installCommand: "npx serve --version > /dev/null 2>&1 || npm install -g serve",
        envVars: { PORT: portEnv },
        confidence: 85,
      };
    }
    return {
      framework: "unknown",
      language: "unknown",
      startCommand: `npx serve . -p ${port}`,
      buildCommand: null,
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 10,
    };
  }

  const pkg = await readJson<PackageJson>(pkgPath);
  if (!pkg) {
    return {
      framework: "unknown",
      language: "unknown",
      startCommand: `node index.js`,
      buildCommand: null,
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 10,
    };
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  const hasReact = "react" in allDeps;
  const hasVue = "vue" in allDeps || hasNuxt;
  const hasNextDep = "next" in allDeps || hasNext;
  const hasExpress = "express" in allDeps || "fastify" in allDeps || "koa" in allDeps || "hono" in allDeps;
  const hasPhaser = "phaser" in allDeps;
  const hasThree = "three" in allDeps;
  const hasViteDep = "vite" in allDeps;

  const buildScript = scripts.build ?? null;
  const devScript = scripts.dev ?? scripts.start ?? null;
  const startScript = scripts.start ?? scripts.dev ?? null;

  if (hasPhaser) {
    const startCmd = scripts.dev
      ? `PORT=${port} npm run dev`
      : `npx serve . -p ${port}`;
    return {
      framework: "phaser",
      language: "js",
      startCommand: startCmd,
      buildCommand: buildScript ? "npm run build" : null,
      installCommand: "npm install",
      envVars: { PORT: portEnv, VITE_PORT: portEnv },
      confidence: 95,
    };
  }

  if (hasThree) {
    const startCmd = scripts.dev
      ? `PORT=${port} npm run dev`
      : hasIndexHtml ? `npx serve . -p ${port}` : `node index.js`;
    return {
      framework: "threejs",
      language: "js",
      startCommand: startCmd,
      buildCommand: buildScript ? "npm run build" : null,
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 93,
    };
  }

  if (hasNextDep) {
    return {
      framework: "nextjs",
      language: "js",
      startCommand: `PORT=${port} npm run dev`,
      buildCommand: "npm run build",
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 97,
    };
  }

  if (hasVue || hasNuxt) {
    return {
      framework: "vue",
      language: "js",
      startCommand: `PORT=${port} npm run dev`,
      buildCommand: buildScript ? "npm run build" : null,
      installCommand: "npm install",
      envVars: { PORT: portEnv, VITE_PORT: portEnv },
      confidence: 95,
    };
  }

  if (hasReact && (hasVite || hasViteDep)) {
    return {
      framework: "vite",
      language: "js",
      startCommand: `PORT=${port} npm run dev`,
      buildCommand: "npm run build",
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 96,
    };
  }

  if (hasReact) {
    return {
      framework: "react",
      language: "js",
      startCommand: `PORT=${port} npm start`,
      buildCommand: "npm run build",
      installCommand: "npm install",
      envVars: { PORT: portEnv, HOST: "0.0.0.0", BROWSER: "none" },
      confidence: 94,
    };
  }

  if (hasExpress) {
    const hasReactOrVue = hasReact || hasVue;
    if (hasReactOrVue) {
      return {
        framework: "fullstack",
        language: "js",
        startCommand: `PORT=${port} npm start`,
        buildCommand: buildScript ? "npm run build" : null,
        installCommand: "npm install",
        envVars: { PORT: portEnv, HOST: "0.0.0.0", NODE_ENV: "production" },
        confidence: 88,
      };
    }
    return {
      framework: "express",
      language: "js",
      startCommand: startScript ? `PORT=${port} npm start` : `PORT=${port} node ${pkg.main ?? "index.js"}`,
      buildCommand: null,
      installCommand: "npm install",
      envVars: { PORT: portEnv, HOST: "0.0.0.0", NODE_ENV: "production" },
      confidence: 93,
    };
  }

  if (hasVite || hasViteDep) {
    return {
      framework: "vite",
      language: "js",
      startCommand: `PORT=${port} npm run dev`,
      buildCommand: "npm run build",
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 90,
    };
  }

  if (hasIndexHtml) {
    return {
      framework: "html",
      language: "js",
      startCommand: `npx serve . -p ${port} -s`,
      buildCommand: null,
      installCommand: "npm install",
      envVars: { PORT: portEnv },
      confidence: 82,
    };
  }

  const entryFile = pkg.main ?? scripts.start?.replace("node ", "") ?? "index.js";
  return {
    framework: "node",
    language: "js",
    startCommand: startScript ? `PORT=${port} npm start` : `PORT=${port} node ${entryFile}`,
    buildCommand: null,
    installCommand: "npm install",
    envVars: { PORT: portEnv, HOST: "0.0.0.0", NODE_ENV: "production" },
    confidence: 75,
  };
}
