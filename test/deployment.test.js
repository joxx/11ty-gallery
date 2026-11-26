import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
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

test("deploy.env.example nennt alle elf Einstellungen", async () => {
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
    "DEPLOY_TIMEOUT",
  ]);
});

test("deploy.env ist ignoriert, deploy.env.example nicht", async () => {
  assert.equal(await istIgnoriert("deploy.env"), true);
  assert.equal(await istIgnoriert("deploy.env.example"), false);
});

const skript = `${wurzel}scripts/deploy.sh`;

function nurPflicht() {
  return {
    PATH: process.env.PATH,
    DEPLOY_HOST: "beispiel.test",
    DEPLOY_USER: "u",
    DEPLOY_PASSWORD: "geheim",
    DEPLOY_PATH: "/htdocs/galerie",
  };
}

async function fehlschlag(argumente, env) {
  return run(skript, argumente, { env }).then(
    () => null,
    (fehler) => fehler,
  );
}

test("deploy.sh ist ausführbar und syntaktisch gültig", async () => {
  const { mode } = await fs.stat(skript);
  assert.notEqual(mode & 0o111, 0);
  await run("bash", ["-n", skript]);
});

test("deploy.sh liest keine Einstellung, die in der Vorlage fehlt", async () => {
  const text = await fs.readFile(skript, "utf8");
  const benutzt = [...new Set([...text.matchAll(/\$\{?(DEPLOY_[A-Z_]+)/g)].map((m) => m[1]))];
  assert.deepEqual(benutzt.sort(), (await schluesselAusVorlage()).sort());
});

test("fehlende Pflichtangabe bricht mit klarer Meldung ab", async () => {
  const fehler = await fehlschlag([], { PATH: process.env.PATH, DEPLOY_ENV_FILE: "/dev/null" });
  assert.notEqual(fehler, null);
  assert.match(fehler.stderr, /DEPLOY_HOST/);
  assert.match(fehler.stderr, /fehlt/);
});

test("unbekanntes Protokoll wird benannt", async () => {
  const fehler = await fehlschlag([], {
    ...nurPflicht(),
    DEPLOY_ENV_FILE: "/dev/null",
    DEPLOY_PROTOCOL: "gopher",
  });
  assert.match(fehler.stderr, /gopher/);
  assert.match(fehler.stderr, /sftp/);
});

test("Umgebungsvariable schlägt deploy.env, Passwort wird nie ausgegeben", async () => {
  const ordner = await fs.mkdtemp(`${os.tmpdir()}/deploy-`);
  const datei = `${ordner}/env`;
  await fs.writeFile(datei, "DEPLOY_HOST=aus-der-datei\nDEPLOY_PASSWORD=aus-der-datei\n");
  const { stdout } = await run(skript, ["--print-config"], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: datei, DEPLOY_HOST: "aus-der-umgebung" },
  });
  assert.match(stdout, /aus-der-umgebung/);
  assert.doesNotMatch(stdout, /aus-der-datei/);
  assert.match(stdout, /DEPLOY_PASSWORD=\*\*\*/);
  assert.doesNotMatch(stdout, /geheim/);
});

test("Pfad mit Leerzeichen bleibt ein Argument", async () => {
  const { stdout } = await run(skript, ["--print-config"], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: "/dev/null", DEPLOY_PATH: "/htdocs/Meine Fotos" },
  });
  assert.match(stdout, /DEPLOY_PATH="\/htdocs\/Meine Fotos"/);
});

test("lftp wird benannt, wenn es fehlt", async () => {
  const fehler = await fehlschlag([], {
    ...nurPflicht(),
    DEPLOY_ENV_FILE: "/dev/null",
    LFTP_BIN: "/nicht/vorhanden/lftp",
  });
  assert.match(fehler.stderr, /lftp fehlt/);
  assert.match(fehler.stderr, /brew install lftp/);
});

test("--dry-run löscht nichts und nennt den Trockenlauf", async () => {
  const ohne = await run(skript, ["--print-config"], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: "/dev/null" },
  }).then((r) => r.stdout);
  assert.doesNotMatch(ohne, /--delete/);

  const mit = await run(skript, ["--dry-run", "--print-config"], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: "/dev/null", DEPLOY_DELETE: "1" },
  }).then((r) => r.stdout);
  assert.match(mit, /Trockenlauf/);
  assert.match(mit, /--dry-run/);
  assert.match(mit, /--delete/);
});

async function fakeLftp(rumpf) {
  const ordner = await fs.mkdtemp(`${os.tmpdir()}/lftp-`);
  const datei = `${ordner}/lftp`;
  await fs.writeFile(datei, `#!/bin/bash\n${rumpf}\n`);
  await fs.chmod(datei, 0o755);
  return datei;
}

test("bricht ab, wenn lftp nicht antwortet", async () => {
  const lftp = await fakeLftp("exec sleep 30");
  const startn = Date.now();
  const fehler = await fehlschlag([], {
    ...nurPflicht(),
    DEPLOY_ENV_FILE: "/dev/null",
    LFTP_BIN: lftp,
    DEPLOY_TIMEOUT: "1",
  });
  assert.match(fehler.stderr, /Zeitüberschreitung/);
  assert.ok(Date.now() - startn < 15000, "Wächter hat nicht abgebrochen");
});

test("gibt den Exit-Code von lftp weiter", async () => {
  const lftp = await fakeLftp("exit 4");
  const fehler = await fehlschlag([], {
    ...nurPflicht(),
    DEPLOY_ENV_FILE: "/dev/null",
    LFTP_BIN: lftp,
  });
  assert.equal(fehler.code, 4);
});

test("Workflow testet vor dem Veröffentlichen und cached die Bilder", async () => {
  const text = await fs.readFile(`${wurzel}.github/workflows/deploy.yml`, "utf8");
  assert.ok(text.indexOf("npm test") < text.indexOf("scripts/deploy.sh"));
  assert.ok(text.indexOf("actions/cache") < text.indexOf("npm run build"));
  for (const name of ["DEPLOY_HOST", "DEPLOY_USER", "DEPLOY_PASSWORD", "DEPLOY_PATH"]) {
    assert.match(text, new RegExp(`secrets\\.${name}`));
  }
});

test("Workflow nutzt keine Actions von Dritten", async () => {
  const text = await fs.readFile(`${wurzel}.github/workflows/deploy.yml`, "utf8");
  const genutzt = [...text.matchAll(/uses:\s*(\S+)/g)].map((treffer) => treffer[1]);
  assert.ok(genutzt.length > 0);
  for (const aktion of genutzt) {
    assert.match(aktion, /^actions\/(checkout|setup-node|cache)@v4$/);
  }
});
