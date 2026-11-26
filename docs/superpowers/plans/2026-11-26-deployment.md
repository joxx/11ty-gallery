# Deployment und README — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Galerie lässt sich auf drei dokumentierten Wegen veröffentlichen (manuell per `lftp`, automatisch per GitHub Actions, über Netlify) und die README erklärt Einstieg, Deployment, Repo-Sichtbarkeit und `noindex`.

**Architecture:** Ein einziges Shell-Skript `scripts/deploy.sh` spiegelt `_site` per `lftp` auf den Webspace und liest seine Konfiguration aus der Umgebung (`deploy.env` lokal, Repo-Secrets in Actions). Actions und Netlify rufen denselben Build auf; Netlify bekommt nur eine `netlify.toml`. Alle neuen Dateien werden durch `node --test`-Tests abgesichert, die Konfiguration, Vorlage und Workflow gegeneinander prüfen.

**Tech Stack:** Bash 3.2+ (macOS-Systemstand), `lftp` ≥ 4.9, Eleventy 3 (bestehend), `node --test` (bestehend), GitHub Actions, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-26-deployment-design.md`

## Global Constraints

- Node ≥ 20; Tests laufen mit `npm test` = `node --test "test/**/*.test.js"` (neue Dateien werden automatisch erfasst)
- `noindex` bleibt unverändert: `src/_includes/base.njk` und `src/robots.txt` und deren Tests in `test/build.test.js` werden **nicht** angefasst
- Kein Fremdwerkzeug außer `lftp`; in Actions nur `actions/checkout`, `actions/setup-node`, `actions/cache`
- Zugangsdaten nie im Repo, nie in Logs, nie als Kommandozeilenargument
- `DEPLOY_DELETE` ist standardmäßig `0`; Löschen nur bei explizitem `1`
- Repo ist öffentlich; Lizenz ISC (wie `package.json`), Rechteinhaber „Joachim Kliemann", Jahr 2026
- Dokumentation und Commit-Nachrichten auf Deutsch, Commit-Stil wie bisher (`feat:`, `docs:`, `chore:`, `test:`)

## Review Focus

- **Passwort im Klartext**: in `--print-config`, in Fehlermeldungen und im Actions-Log. Erwartet: es erscheint nirgends, auch nicht maskiert-verkürzt.
- **`mirror --delete` mit falschem `DEPLOY_PATH`**: löscht fremde Dateien auf dem Webspace. Erwartet: `--delete` nur bei `DEPLOY_DELETE=1`.
- **Vorrang der Konfiguration**: in Actions stehen Zugangsdaten als Umgebungsvariablen, lokal in `deploy.env`. Erwartet: eine gesetzte Umgebungsvariable wird von `deploy.env` nicht überschrieben.
- **Pfade mit Leerzeichen oder Umlauten** in `DEPLOY_PATH`/`DEPLOY_SOURCE`. Erwartet: korrekt gequotet, kein Wortbruch.
- **Fehlendes `lftp`**: Erwartet: eine Meldung mit Installationshinweis, kein `command not found` aus dem Nichts.

---

### Task 1: Konfigurationsvorlage und Schutz der Zugangsdaten

**Files:**
- Create: `deploy.env.example`
- Modify: `.gitignore`
- Test: `test/deployment.test.js`

**Interfaces:**
- Produces: `deploy.env.example` mit genau diesen Schlüsseln (Reihenfolge so, Kommentare mit `#`): `DEPLOY_PROTOCOL`, `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PASSWORD`, `DEPLOY_PATH`, `DEPLOY_SOURCE`, `DEPLOY_DELETE`, `DEPLOY_SSH_KEY`, `DEPLOY_ENV_FILE`

- [ ] **Step 1: Write the failing test**

```js
// test/deployment.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const wurzel = new URL("..", import.meta.url).pathname;

export const schluesselAusVorlage = async () => {
  const text = await fs.readFile(`${wurzel}deploy.env.example`, "utf8");
  return text
    .split("\n")
    .filter((zeile) => zeile.trim() && !zeile.trimStart().startsWith("#"))
    .map((zeile) => zeile.split("=")[0].trim());
};

test("deploy.env.example nennt alle neun Einstellungen", async () => {
  assert.deepEqual(await schluesselAusVorlage(), [
    "DEPLOY_PROTOCOL", "DEPLOY_HOST", "DEPLOY_PORT", "DEPLOY_USER",
    "DEPLOY_PASSWORD", "DEPLOY_PATH", "DEPLOY_SOURCE", "DEPLOY_DELETE",
    "DEPLOY_SSH_KEY", "DEPLOY_ENV_FILE",
  ]);
});

test("deploy.env ist ignoriert, deploy.env.example nicht", async () => {
  const ignoriert = await run("git", ["check-ignore", "--no-index", "-q", "deploy.env"])
    .then(() => true, () => false);
  const vorlage = await run("git", ["check-ignore", "--no-index", "-q", "deploy.env.example"])
    .then(() => true, () => false);
  assert.equal(ignoriert, true);
  assert.equal(vorlage, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT: deploy.env.example` und `assert.equal(ignoriert, true)` schlägt fehl.

- [ ] **Step 3: Create `deploy.env.example` und `.gitignore`-Eintrag**

Vorlage mit Kommentarzeilen, die jede Einstellung in einem Satz erklärt (Protokoll `sftp|ftp|ftps`, Port leer = 22 bzw. 21, `DEPLOY_PATH` als Zielordner auf dem Server, `DEPLOY_SOURCE=_site`, `DEPLOY_DELETE=0` mit Warnung, `DEPLOY_SSH_KEY` leer = Passwort, `DEPLOY_ENV_FILE` leer = `./deploy.env`). Werte: `DEPLOY_PROTOCOL=sftp`, `DEPLOY_HOST=`, `DEPLOY_PORT=`, `DEPLOY_USER=`, `DEPLOY_PASSWORD=`, `DEPLOY_PATH=`, `DEPLOY_SOURCE=_site`, `DEPLOY_DELETE=0`, `DEPLOY_SSH_KEY=`, `DEPLOY_ENV_FILE=`.

In `.gitignore` ergänzen:

```
# echte Zugangsdaten
deploy.env
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 39 Tests (37 alte + 2 neue).

- [ ] **Step 5: Commit**

```bash
git add deploy.env.example .gitignore test/deployment.test.js
git commit -m "feat: Deploy-Konfigurationsvorlage und ignorierte deploy.env"
```

---

### Task 2: `scripts/deploy.sh`

**Files:**
- Create: `scripts/deploy.sh`
- Modify: `package.json` (Skripte `deploy`, `deploy:dry`)
- Test: `test/deployment.test.js`

**Interfaces:**
- Consumes: Schlüssel aus Task 1
- Produces: `scripts/deploy.sh [--dry-run] [--print-config] [--help]`, Exit 0 bei Erfolg, 1 bei Konfigurationsfehler, Exit-Code von `lftp` bei Übertragungsfehler. `LFTP_BIN` überschreibt den Programmnamen (Standard `lftp`, nur zum Testen). `npm run deploy`, `npm run deploy:dry`. `--print-config` gibt die aufgelöste Konfiguration **und** die geplante `lftp`-Kommandozeile aus, ohne sie auszuführen.

- [ ] **Step 1: Write the failing test**

```js
const skript = `${wurzel}scripts/deploy.sh`;

test("deploy.sh ist ausführbar und syntaktisch gültig", async () => {
  const { mode } = await fs.stat(skript);
  assert.notEqual(mode & 0o111, 0);
  await run("bash", ["-n", skript]); // wirft bei Syntaxfehlern
});

test("deploy.sh liest keine Einstellung, die in der Vorlage fehlt", async () => {
  const text = await fs.readFile(skript, "utf8");
  const benutzt = [...new Set([...text.matchAll(/\$\{?(DEPLOY_[A-Z_]+)/g)].map((m) => m[1]))];
  assert.deepEqual(benutzt.sort(), (await schluesselAusVorlage()).sort());
});

test("fehlende Pflichtangabe bricht mit klarer Meldung ab", async () => {
  const fehler = await run(skript, [], {
    env: { PATH: process.env.PATH, DEPLOY_ENV_FILE: "/dev/null" },
  }).then(() => null, (e) => e);
  assert.notEqual(fehler, null);
  assert.match(fehler.stderr, /DEPLOY_HOST/);
  assert.match(fehler.stderr, /fehlt/);
});

test("unbekanntes Protokoll wird benannt", async () => {
  const fehler = await run(skript, [], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: "/dev/null", DEPLOY_PROTOCOL: "gopher" },
  }).then(() => null, (e) => e);
  assert.match(fehler.stderr, /gopher/);
  assert.match(fehler.stderr, /sftp/);
});

test("Umgebungsvariable schlägt deploy.env, Passwort wird nie ausgegeben", async () => {
  const datei = `${await fs.mkdtemp("/tmp/deploy-")}/env`;
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
  const fehler = await run(skript, [], {
    env: { ...nurPflicht(), DEPLOY_ENV_FILE: "/dev/null", LFTP_BIN: "/nicht/vorhanden/lftp" },
  }).then(() => null, (e) => e);
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
```

`nurPflicht()` ist ein Helfer im Testfile: `{ PATH: process.env.PATH, DEPLOY_HOST: "beispiel.test", DEPLOY_USER: "u", DEPLOY_PASSWORD: "geheim", DEPLOY_PATH: "/htdocs/galerie" }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT: scripts/deploy.sh`.

- [ ] **Step 3: Implement `scripts/deploy.sh`**

`#!/usr/bin/env bash`, `set -u` (kein `-e`, damit eigene Fehlermeldungen greifen), `IFS` unverändert. Aufbau:

```bash
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE=${DEPLOY_ENV_FILE:-$REPO_ROOT/deploy.env}
TROCKENLAUF=0; NUR_CONFIG=0
# --dry-run / --print-config / --help auswerten, Unbekanntes -> usage + exit 1

# deploy.env laden, ohne gesetzte Variablen zu überschreiben:
while IFS='=' read -r key wert; do
  case "$key" in ''|\#*) continue;; esac
  [ -n "${!key+x}" ] || export "$key=$wert"
done < "$ENV_FILE"   # nur wenn -f "$ENV_FILE"

# Pflicht prüfen: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH; DEPLOY_PASSWORD nur,
# wenn DEPLOY_SSH_KEY leer ist. Meldung: "deploy.sh: DEPLOY_HOST fehlt (deploy.env oder Umgebung)."
# Protokoll prüfen: sftp|ftp|ftps, sonst "unbekanntes Protokoll: gopher (erlaubt: sftp, ftp, ftps)"
# DEPLOY_SOURCE relativ zu REPO_ROOT auflösen, Verzeichnis muss existieren
# Port: DEPLOY_PORT oder 22 bei sftp, 21 sonst
# --print-config: jede Variable ausgeben, DEPLOY_PASSWORD immer als ***
#   Format: DEPLOY_PATH="/htdocs/Meine Fotos" (in Anführungszeichen)
#   danach die geplante lftp-Kommandozeile, maskiert und nur zur Ansicht
# --print-config beendet mit exit 0 vor jedem Netzzugriff
```

Übertragung (nur ohne `--print-config`):

```bash
LFTP=${LFTP_BIN:-lftp}
command -v "$LFTP" >/dev/null || { echo "deploy.sh: lftp fehlt. macOS: brew install lftp, Debian/Ubuntu: apt-get install lftp" >&2; exit 1; }

url="$DEPLOY_PROTOCOL://$DEPLOY_HOST:$PORT$DEPLOY_PATH"
hinweis=""
[ "$TROCKENLAUF" = 1 ] && hinweis=" (Trockenlauf)"
echo "deploy.sh: lädt $DEPLOY_SOURCE nach $url$hinweis"

opts=(--reverse --parallel=4 --verbose=1 --no-perms --exclude-glob=.DS_Store)
[ "${DEPLOY_DELETE:-0}" = "1" ] && opts+=(--delete)
[ "$TROCKENLAUF" = "1" ] && opts+=(--dry-run)

befehle="set cmd:fail-exit yes; set net:max-retries 1;"
[ -n "${DEPLOY_SSH_KEY:-}" ] && befehle+=" set sftp:connect-program \"ssh -a -x -i $DEPLOY_SSH_KEY\";"
befehle+=" mirror ${opts[*]} \"$DEPLOY_SOURCE\" .; bye"

if [ -n "${DEPLOY_PASSWORD:-}" ]; then
  LFTP_PASSWORD="$DEPLOY_PASSWORD" "$LFTP" --env-password -u "$DEPLOY_USER" "$url" -e "$befehle"
else
  "$LFTP" -u "$DEPLOY_USER" "$url" -e "$befehle"   # Key-Auth, lftp fragt kein Passwort
fi
```

`--print-config` gibt dieselben Werte und `befehle` aus (Passwort maskiert) und endet vorher. Kein `-e`-Kommandozeilenpasswort, kein Passwort in `ps`, `--no-perms` wegen Shared Hosting, `set cmd:fail-exit yes` treibt den Exit-Code.

`package.json`:

```json
"deploy": "scripts/deploy.sh",
"deploy:dry": "scripts/deploy.sh --dry-run"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x scripts/deploy.sh && npm test`
Expected: PASS, 47 Tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh package.json test/deployment.test.js
git commit -m "feat: Deploy-Skript für SFTP, FTP und FTPS"
```

---

### Task 3: Skript gegen echtes `lftp` prüfen

**Files:** keine neuen; ggf. Korrektur in `scripts/deploy.sh`

**Interfaces:**
- Consumes: `scripts/deploy.sh` aus Task 2

- [ ] **Step 1: `lftp` installieren**

Run: `brew install lftp` (einmalig, ca. 5 MB; Alternative ohne Installation: Task 3 überspringen und im Abschlussbericht vermerken, dass der echte Upload ungeprüft ist)

- [ ] **Step 2: Optionen bestätigen**

Run: `lftp -c 'help mirror'`
Expected: Liste enthält `--parallel`, `--no-perms`, `--delete`, `--dry-run`, `--exclude-glob`. Fehlt eine Option, Skript und Test an die tatsächlich vorhandene Option anpassen (`--dry-run` ggf. durch `--dry-run`-Ersatz ersetzen: Trockenlauf dann über `lftp`s `mirror --dry-run`-Entsprechung oder Ausgabe der Kommandozeile, statt sie auszuführen).

- [ ] **Step 3: Trockenlauf gegen einen toten Host**

Run: `DEPLOY_ENV_FILE=/dev/null DEPLOY_HOST=127.0.0.1 DEPLOY_PORT=1 DEPLOY_USER=u DEPLOY_PASSWORD=p DEPLOY_PATH=/x scripts/deploy.sh --dry-run`
Expected: Verbindungsfehler („Connection refused" o. ä.), Exit ≠ 0, **kein** „unknown option", kein `p` im output.

- [ ] **Step 4: Commit (nur falls Korrekturen nötig waren)**

```bash
git add scripts/deploy.sh test/deployment.test.js
git commit -m "fix: Deploy-Skript an lftp-Optionen angepasst"
```

---

### Task 4: GitHub-Actions-Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`
- Test: `test/deployment.test.js`

**Interfaces:**
- Consumes: `scripts/deploy.sh`, `npm test`, `npm run build`, Secrets `DEPLOY_PROTOCOL`, `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PASSWORD`, `DEPLOY_PATH`, `DEPLOY_DELETE`, `DEPLOY_SSH_KEY`
- Produces: Workflow „Veröffentlichen" bei Push auf `main` und `workflow_dispatch`

- [ ] **Step 1: Write the failing test**

```js
test("Workflow testet vor dem Veröffentlichen", async () => {
  const text = await fs.readFile(`${wurzel}.github/workflows/deploy.yml`, "utf8");
  assert.ok(text.indexOf("npm test") < text.indexOf("scripts/deploy.sh"));
  assert.ok(text.indexOf("actions/cache") < text.indexOf("npm run build"));
  for (const name of ["DEPLOY_HOST", "DEPLOY_USER", "DEPLOY_PASSWORD", "DEPLOY_PATH"]) {
    assert.match(text, new RegExp(`secrets\\.${name}`));
  }
});

test("Workflow nutzt keine Actions von Dritten", async () => {
  const text = await fs.readFile(`${wurzel}.github/workflows/deploy.yml`, "utf8");
  const genutzt = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(genutzt.length > 0);
  for (const aktion of genutzt) assert.match(aktion, /^actions\/(checkout|setup-node|cache)@v4$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT: .github/workflows/deploy.yml`.

- [ ] **Step 3: Create `.github/workflows/deploy.yml`**

Schritte in dieser Reihenfolge: `checkout` → `setup-node` (`node-version: 22`, `cache: npm`) → `npm ci` → `npm test` → `actions/cache` (`path: .cache/eleventy-img`, `key: eleventy-img-${{ runner.os }}-${{ hashFiles('src/photos/**') }}`, `restore-keys: eleventy-img-${{ runner.os }}-`) → `npm run build` → `sudo apt-get update && sudo apt-get install -y lftp` → `./scripts/deploy.sh` mit `env:` aus den Secrets. Dazu `on: push: branches: [main]` und `workflow_dispatch`, `permissions: contents: read`, `concurrency: group: deploy, cancel-in-progress: false`. `DEPLOY_PORT`, `DEPLOY_SSH_KEY`, `DEPLOY_DELETE` optional mit `${{ secrets.X }}` (leer ist erlaubt).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 49 Tests.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml test/deployment.test.js
git commit -m "feat: GitHub-Actions-Workflow zum Veröffentlichen"
```

---

### Task 5: Netlify-Konfiguration

**Files:**
- Create: `netlify.toml`
- Test: `test/deployment.test.js`

**Interfaces:**
- Produces: `netlify.toml` mit `[build] command = "npm run build"`, `publish = "_site"`, `[build.environment] NODE_VERSION = "22"`

- [ ] **Step 1: Write the failing test**

```js
test("netlify.toml baut mit npm run build und veröffentlicht _site", async () => {
  const text = await fs.readFile(`${wurzel}netlify.toml`, "utf8");
  assert.match(text, /command\s*=\s*"npm run build"/);
  assert.match(text, /publish\s*=\s*"_site"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT: netlify.toml`.

- [ ] **Step 3: Create `netlify.toml`**

Nur die drei Angaben, dazu ein Kommentar, dass die Verbindung in der Netlify-Oberfläche entsteht und `noindex` unverändert bleibt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 50 Tests.

- [ ] **Step 5: Commit**

```bash
git add netlify.toml test/deployment.test.js
git commit -m "feat: Netlify-Konfiguration"
```

---

### Task 6: Lizenz

**Files:**
- Create: `LICENSE`
- Test: `test/deployment.test.js`

**Interfaces:**
- Produces: `LICENSE` mit ISC-Text, `Copyright (c) 2026 Joachim Kliemann`

- [ ] **Step 1: Write the failing test**

```js
test("LICENSE ist ISC wie in package.json", async () => {
  const pkg = JSON.parse(await fs.readFile(`${wurzel}package.json`, "utf8"));
  const text = await fs.readFile(`${wurzel}LICENSE`, "utf8");
  assert.equal(pkg.license, "ISC");
  assert.match(text, /ISC License/);
  assert.match(text, /Copyright \(c\) 2026 Joachim Kliemann/);
  assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT: LICENSE`.

- [ ] **Step 3: Create `LICENSE`**

Wortlaut der ISC-Lizenz (Standardtext), Rechteinhaber Joachim Kliemann, Jahr 2026.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 51 Tests.

- [ ] **Step 5: Commit**

```bash
git add LICENSE test/deployment.test.js
git commit -m "docs: ISC-Lizenz"
```

---

### Task 7: README neu schreiben

**Files:**
- Modify: `README.md` (vollständig ersetzen)
- Test: `test/deployment.test.js`

**Interfaces:**
- Consumes: Dateinamen und Variablen aus Task 1–6

- [ ] **Step 1: Write the failing test**

```js
test("README erklärt alle drei Wege, beide Repo-Varianten und noindex", async () => {
  const text = await fs.readFile(`${wurzel}README.md`, "utf8");
  for (const muss of [
    "deploy.env.example", "scripts/deploy.sh", "npm run deploy",
    ".github/workflows/deploy.yml", "netlify.toml",
    "Öffentlich oder privat", "privates Repo", "noindex", "LICENSE",
  ]) assert.ok(text.includes(muss), `README nennt ${muss} nicht`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — fehlende Nennungen (`deploy.env.example`, `Öffentlich oder privat`, `LICENSE`).

- [ ] **Step 3: README schreiben**

Gliederung wie im Design, Kapitel 1–9. Pflichtinhalte je Kapitel: Was das ist (ein Absatz, öffentliche Vorlage, Link auf das Repo); Schnellstart (klonen, `npm install`, `npm run serve`); Album anlegen (bestehender Text, unverändert übernehmen); Lokal bauen; **Öffentlich oder privat** (Fotos in einem öffentlichen Repo sind öffentlich, auch in der History; privates Repo = Weg 1, Wege 2 und 3 entfallen); **Veröffentlichen** (Entscheidungstabelle, dann je Weg Voraussetzungen, Befehle, wo Zugangsdaten liegen, Fallstricke — inkl. `DEPLOY_DELETE=1`-Warnung und `deploy.env`-Vorlage); Bilddaten und GPS (bestehender Text); **Was `noindex` leistet und was nicht**; Tests, Projektstruktur, Design-Dokumente, Lizenz.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 52 Tests.

- [ ] **Step 5: Commit**

```bash
git add README.md test/deployment.test.js
git commit -m "docs: README mit Schnellstart, Repo-Sichtbarkeit und drei Deployment-Wegen"
```

---

### Task 8: Abschluss

**Files:**
- Modify: `docs/superpowers/specs/2026-11-26-deployment-design.md` (Status)

- [ ] **Step 1: Design-Doc auf „Umgesetzt" setzen**

Status-Zeile ändern, darunter eine Zeile mit dem Datum.

- [ ] **Step 2: Volle Verifikation**

Run: `npm test && npm run build`
Expected: alle Tests PASS, `_site/` entsteht, `_site/robots.txt` beginnt mit `User-agent: *` und `Disallow: /` (unverändert).

- [ ] **Step 3: Prüfen, dass keine Zugangsdaten im Repo liegen**

Run: `git ls-files | grep -x "deploy.env"` (erwartet: keine Ausgabe) und `git log --all -p -S "DEPLOY_PASSWORD=" -- . ':!deploy.env.example' ':!test' | grep -c "DEPLOY_PASSWORD" || true` (erwartet: 0 Treffer außerhalb von Vorlage und Tests).

- [ ] **Step 4: Push**

```bash
git add docs/superpowers/specs/2026-11-26-deployment-design.md
git commit -m "docs: Design zu Deployment und README als umgesetzt markiert"
git push origin main
```

Expected: Push erfolgreich; der Workflow „Veröffentlichen" startet und schlägt fehl, solange keine Repo-Secrets gesetzt sind — das ist erwartet und gehört in den Abschlussbericht (Hinweis: Secrets lassen sich nicht per Skript anlegen, nur in der GitHub-Oberfläche oder per `gh secret set`).
