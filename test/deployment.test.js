import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const wurzel = new URL("..", import.meta.url).pathname;

async function schluesselAusVorlage() {
  const text = await fs.readFile(`${wurzel}deploy.env.example`, "utf8");
  return text
    .split("\n")
    .filter((zeile) => zeile.trim() && !zeile.trimStart().startsWith("#"))
    .map((zeile) => zeile.split("=")[0].trim());
}

async function istIgnoriert(pfad) {
  return run("git", ["check-ignore", "--no-index", "-q", pfad], { cwd: wurzel }).then(
    () => true,
    () => false,
  );
}

test("deploy.env.example nennt alle zehn Einstellungen", async () => {
  assert.deepEqual(await schluesselAusVorlage(), [
    "DEPLOY_PROTOCOL",
    "DEPLOY_HOST",
    "DEPLOY_PORT",
    "DEPLOY_USER",
    "DEPLOY_PASSWORD",
    "DEPLOY_PATH",
    "DEPLOY_SOURCE",
    "DEPLOY_DELETE",
    "DEPLOY_SSH_KEY",
    "DEPLOY_ENV_FILE",
  ]);
});

test("deploy.env ist ignoriert, deploy.env.example nicht", async () => {
  assert.equal(await istIgnoriert("deploy.env"), true);
  assert.equal(await istIgnoriert("deploy.env.example"), false);
});
