import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();
const api = spawn(
  process.execPath,
  [path.join(cwd, "mvp/server/index.mjs")],
  {
    cwd,
    stdio: "inherit",
  },
);

const viteBinary = path.join(cwd, "node_modules/.bin/vite");
const web = spawn(viteBinary, ["--config", "mvp/vite.config.ts"], {
  cwd,
  stdio: "inherit",
  shell: true,
});

const shutdown = (signal) => {
  for (const child of [api, web]) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

api.on("exit", (code) => {
  if (code !== 0) {
    shutdown("SIGTERM");
    process.exit(code ?? 1);
  }
});

web.on("exit", (code) => {
  shutdown("SIGTERM");
  process.exit(code ?? 0);
});
