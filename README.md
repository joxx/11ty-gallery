# Bildergalerie

Eine statische Bildgalerie mit Eleventy. Jeder Ordner unter `src/photos/` ist
ein Album; ein neuer Ordner wird beim nächsten Build automatisch zu einer neuen
Albumseite. Die Bilder werden gezeigt, nicht verwaltet: kein CMS, kein Upload
über die Seite, keine Datenbank.

Dieses Repository ist öffentlich und als Vorlage gedacht: Code, Dokumentation
und funktionierende Beispiele für drei Wege, die fertige Seite zu
veröffentlichen. Wer daraus eine eigene Galerie macht, sollte vorher
[Öffentlich oder privat](#öffentlich-oder-privat) lesen — dort steht, was ein
öffentliches Repository für die Fotos bedeutet.

## Voraussetzungen

- Node.js ≥ 20
- einmalig `npm install` (installiert Eleventy, `sharp` und `exifr`)
- nur zum Veröffentlichen: `lftp` (`brew install lftp`, `apt-get install lftp`)

## Schnellstart

```bash
git clone https://github.com/joxx/11ty-gallery.git
cd 11ty-gallery
npm install
npm run serve      # http://localhost:8080
```

## Ein Album anlegen

```
src/photos/urlaub-2024/
  001.jpg
  002.jpg
  info.json        optional
  captions.json    optional
```

- Der Ordnername wird zum Titel: `urlaub-2024` → „Urlaub 2024". Ordner, die mit
  `_` beginnen, werden ignoriert.
- Die Fotos werden nach Dateiname sortiert, das erste ist das Titelbild. Eine
  Nummerierung wie `001`, `002` … ist deshalb sinnvoll.
- Unterordner innerhalb eines Albums werden nicht ausgewertet.

### `info.json` (optional)

```json
{ "title": "Urlaub an der Ostsee", "description": "Zwei Wochen Strand und Wind." }
```

### `captions.json` (optional)

```json
{
  "001.jpg": { "alt": "Strand bei Ebbe, im Hintergrund zwei Kite-Segel", "caption": "Erster Morgen" }
}
```

`alt` ist der Alternativtext für Screenreader, `caption` die sichtbare
Bildunterschrift. Fehlt ein Eintrag, wird der Alternativtext aus einem
beschreibenden Dateinamen abgeleitet (`strand-ebbe.jpg` → „Strand ebbe"). Bei
Kamera-Namen wie `IMG_1234` oder reinen Nummern lautet er „Foto 3 von 47 im
Album Urlaub 2024" — geraten wird nie.

## Lokal bauen und ansehen

```bash
npm run build   # erzeugt _site/
npm run serve   # Entwicklungsserver mit automatischem Neuladen
```

Beim ersten Build werden die Bilder nach AVIF, WebP und JPEG in vier Breiten
umgerechnet; das dauert bei einem neuen Album einige Sekunden. Alles bereits
Verarbeitete liegt in `.cache/eleventy-img` und wird bei späteren Builds nur
kopiert — ein neues Album kostet nur die neuen Fotos.

## Öffentlich oder privat

Alles, was du in ein öffentliches Repository committest, ist für jeden
sichtbar — dauerhaft, auch in der History. Ein Foto nachträglich zu entfernen
heißt, die History umzuschreiben; das ist keine Kleinigkeit.

Weil die Wege 2 und 3 aus dem Repository bauen, müssen die Fotos dort liegen.
Öffentliches Repository heißt also: öffentliche Fotos.

| Sollen die Fotos öffentlich sein? | Repository | Möglich sind |
| --- | --- | --- |
| ja | öffentlich, wie dieses hier | Weg 1, 2 und 3 |
| nein | privat (`gh repo create --private`) | nur Weg 1 |

Für private Fotos: eigenes privates Repository anlegen, dort committen und nur
den manuellen Weg nutzen. GitHub Actions in einem privaten Repository zählt
verbrauchte Minuten auf das Kontingent des Kontos — ein Build hier liegt bei
ein bis zwei Minuten.

## Veröffentlichen

Drei Wege, dasselbe Ergebnis: der Inhalt von `_site` landet auf einem
Webserver. Nimm den, der zu dir passt; sie schließen sich nicht aus, aber
gleichzeitig brauchst du nur einen.

| Weg | Passt, wenn … | Voraussetzung |
| --- | --- | --- |
| 1. von Hand | du den Webspace schon hast und volle Kontrolle willst | `lftp`, Zugangsdaten |
| 2. GitHub Actions | ein Push veröffentlichen soll, ohne deinen Rechner | Webspace, Repo-Secrets |
| 3. Netlify | du keinen Webspace hast und statisches Hosting magst | Netlify-Konto |

### Weg 1 — von Hand per SFTP oder FTP

```bash
cp deploy.env.example deploy.env    # einmalig, deploy.env ist per .gitignore ausgeschlossen
$EDITOR deploy.env                  # Host, Benutzer, Passwort, Zielpfad eintragen
npm run build
npm run deploy:dry                  # zeigt Konfiguration, Kommandozeile und was übertragen würde
npm run deploy
```

`scripts/deploy.sh` liest `deploy.env` und spiegelt `_site` per `lftp` auf den
Server. Umgebungsvariablen haben Vorrang vor der Datei — so kann derselbe Code
auch in GitHub Actions laufen. Das Passwort wird nie ausgegeben und steht nicht
in der Prozessliste.

| Einstellung | Bedeutung |
| --- | --- |
| `DEPLOY_PROTOCOL` | `sftp`, `ftp` oder `ftps` |
| `DEPLOY_HOST`, `DEPLOY_PORT` | Server; Port leer = 22 bei `sftp`, 21 sonst |
| `DEPLOY_USER`, `DEPLOY_PASSWORD` | Zugang |
| `DEPLOY_PATH` | Zielordner auf dem Server, z. B. `/htdocs/galerie` |
| `DEPLOY_SOURCE` | was hochgeladen wird, Standard `_site` |
| `DEPLOY_DELETE` | `1` löscht serverseitig, was lokal fehlt — Standard `0` |
| `DEPLOY_SSH_KEY` | optional: Pfad zu einem SSH-Key statt Passwort |
| `DEPLOY_ENV_FILE` | optional: andere Konfigurationsdatei als `./deploy.env` |
| `DEPLOY_TIMEOUT` | Abbruch nach so vielen Sekunden, Standard `600` |

Standardeinstellung ist Hochladen ohne Löschen. `DEPLOY_DELETE=1` ist
destruktiv: prüfe `DEPLOY_PATH` doppelt, bevor du es einschaltest — sonst
räumt ein Tippfehler im Pfad den falschen Ordner leer.

Nützlich beim Einrichten:

```bash
scripts/deploy.sh --print-config    # Konfiguration und geplantes lftp-Kommando, ohne Verbindung
scripts/deploy.sh --dry-run         # Connects, aber ändert nichts
scripts/deploy.sh --help
```

### Weg 2 — automatisch mit GitHub Actions

`.github/workflows/deploy.yml` läuft bei jedem Push auf `main` und auf
Knopfdruck (`workflow_dispatch`). Der Lauf testet zuerst, bricht bei roten
Tests ab, baut dann, sichert `.cache/eleventy-img` zwischen den Läufen und lädt
mit demselben `scripts/deploy.sh` hoch wie Weg 1.

Zugangsdaten kommen aus Repository-Secrets (Settings → Secrets and variables →
Actions, oder per `gh`):

```bash
gh secret set DEPLOY_PROTOCOL --body "sftp"
gh secret set DEPLOY_HOST     --body "ftp.example.org"
gh secret set DEPLOY_USER     --body "benutzer"
gh secret set DEPLOY_PASSWORD --body "geheim"
gh secret set DEPLOY_PATH     --body "/htdocs/galerie"
```

Pflicht sind `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PASSWORD` (oder
`DEPLOY_SSH_KEY`) und `DEPLOY_PATH`. Optional: `DEPLOY_PROTOCOL` (Standard
`sftp`), `DEPLOY_PORT`, `DEPLOY_DELETE`, `DEPLOY_TIMEOUT`.

Solange keine Secrets gesetzt sind, schlägt der Workflow fehl — das ist so
gewollt, denn veröffentlichen ohne Zugangsdaten kann nicht funktionieren.

### Weg 3 — Netlify

`netlify.toml` legt fest, wie gebaut wird (`npm run build`) und was
veröffentlicht wird (`_site`). Die Verbindung zum Repository entsteht in der
Netlify-Oberfläche: „Add new site" → „Import an existing project" → Repository
wählen. Weitere Einstellungen braucht es nicht, Netlify liest `netlify.toml`.

Zwei Dinge, die man vorher wissen sollte: Netlify rechnet Bilder bei einem
kalten Build neu, weil `.cache/eleventy-img` dort nicht zwischen Builds liegt —
der erste Build eines großen Bestands dauert spürbar. Und die Fotos liegen
danach bei Netlify, nicht nur auf deinem Webspace.

## Was `noindex` leistet und was nicht

Die Galerie ist auf `noindex` gesetzt: `robots.txt` verbietet allen Bots alles,
und jede Seite trägt `<meta name="robots" content="noindex, nofollow">`. Das
gilt unverändert für alle drei Wege.

- Es hält Suchmaschinen fern: die Seite taucht nicht in Suchergebnissen auf.
- Es schützt **nicht** vor Besuchern, die die URL kennen — `noindex` ist kein
  Passwort.
- Es versteckt **nicht** die Fotos in einem öffentlichen Repository: dort sind
  sie für jeden lesbar, unabhängig von der Website.
- Echten Zugriffsschutz bietet nur der Server: Passwortschutz per `.htaccess`
  oder die Zugriffsregeln des Hosters beziehungsweise Netlify.

## Was mit den Bilddaten passiert

- Angezeigt werden Datum, Kamera, Objektiv, Blende, Belichtungszeit, ISO und
  Brennweite, soweit im Bild vorhanden.
- GPS-Koordinaten werden gelesen und stehen während des Builds zur Verfügung,
  werden aber nicht ausgegeben. Der Build bricht ab, wenn eine Vorlage `gps`
  referenziert. Die ausgelieferten Bildvarianten werden neu kodiert und
  enthalten keine EXIF-Daten; Originale werden nie veröffentlicht.

## Tests

```bash
npm test
```

Die Suite prüft außerdem die Veröffentlichungs-Konfiguration: dass Vorlage und
Skript dieselben Einstellungen kennen, dass `deploy.env` ignoriert wird, dass
der Workflow vor dem Hochladen testet, dass `netlify.toml` den richtigen Ordner
veröffentlicht und dass die README alle drei Wege nennt.

## Aufbau

```
eleventy.config.js            Konfiguration, Vorlagen-Globals, GPS-Prüfung
src/_lib/galerie.js           Ordner scannen, EXIF lesen, Bildvarianten erzeugen
src/_data/                    Alben und Fotos als Vorlagen-Daten
src/index.njk                 Albenübersicht
src/album.njk                 eine Seite pro Album
src/foto.njk                  eine Seite pro Foto
src/assets/style.css          das gesamte CSS
scripts/deploy.sh             Veröffentlichen per SFTP, FTP oder FTPS
deploy.env.example            Vorlage für die Zugangsdaten
.github/workflows/deploy.yml  Veröffentlichen nach einem Push
netlify.toml                  Build und Publish für Netlify
```

Design und Umsetzungspläne liegen unter `docs/superpowers/`.

## Lizenz

ISC, siehe `LICENSE`. Die Galerie darf kopiert, verändert und weitergegeben
werden; behalte den Copyright-Hinweis bei.
