# Deployment und README — Design

Datum: 2026-11-26
Status: Umgesetzt (2026-11-26)

## Absicht

Die Galerie soll auf drei Wegen veröffentlicht werden können: von Hand vom
eigenen Rechner, automatisch nach einem Push über GitHub Actions, und über
Netlify. Dazu kommt eine README, die den Einstieg trägt: was das Projekt ist,
wie ein Album entsteht, wie man es ansieht und wie es auf den Webspace kommt —
mit Beispielen, die im Repo liegen und funktionieren.

Warum drei Wege: Der Webspace ist der dauerhafte Ort für die Fotos. Der
manuelle Weg ist der einfachste Einstieg und funktioniert ohne jeden Dienst;
der Actions-Weg veröffentlicht ohne lokalen Rechner; Netlify ist der bequemste
Weg, legt die Galerie aber bei einem Dritten.

Das Repo ist öffentlich und dient als Vorlage: Wer eine eigene Galerie will,
findet hier Code, Doku und funktionierende Deploy-Beispiele. Weil die
Deploy-Wege 2 und 3 aus dem Repo bauen, liegen die Fotos dort — bei einem
öffentlichen Repo also sichtbar für jeden. Die README sagt das klar und nennt
den Weg für alle, die ihre Fotos privat halten wollen: ein privates Repo und
der manuelle Weg 1.

## Ziele

- Ein Befehl veröffentlicht `_site` per SFTP oder FTP auf den Webspace
- Zugangsdaten liegen nie im Repo, sondern in einer ignorierten `deploy.env`,
  in Repo-Secrets oder im Netlify-Projekt
- Löschen entfernter Dateien auf dem Server ist möglich, aber nicht Standard
- Ein Trockenlauf zeigt, was hochgeladen würde, ohne etwas zu ändern
- Push auf `main` baut, testet und veröffentlicht automatisch; der
  Bild-Cache überlebt zwischen den Läufen
- README erklärt alle drei Wege und nennt Voraussetzungen und Fallstricke
- README erklärt den Unterschied zwischen öffentlichem Vorlagen-Repo und
  privatem Repo mit privaten Fotos, samt Folgen für die Deploy-Wege
- `noindex` bleibt unverändert im Code (Meta-Tag und `robots.txt`) und wird in
  der README erklärt: Es hält Suchmaschinen fern, nicht Besucher und nicht
  GitHub

## Nicht-Ziele

- Keine Deploy-Action oder Deploy-CLI von Dritten im Pfad zum Webspace
- Kein Vorschau-Deploy pro Pull Request in Version 1
- Kein Zugriffsschutz (Passwort, Basic Auth) — `noindex` bleibt, was es ist
- Kein Rollback-Mechanismus, keine Versionierung der veröffentlichten Seite
- Keine Änderung an `noindex`, `robots.txt` oder den zugehörigen Tests

## Randbedingungen

- Webspace bietet **FTP/SFTP mit Passwort**, keine SSH-Shell → `rsync` ist kein
  Weg (rsync braucht einen Shell-Zugang)
- `lftp` ist nicht installiert (macOS: `brew install lftp`, Debian/Ubuntu:
  `apt-get install lftp`); es ist das einzige zusätzliche Werkzeug
- Node ≥ 20, Build braucht `sharp`; Actions und Netlify können das
- Repo ist öffentlich (`joxx/11ty-gallery`) und enthält derzeit keine Fotos
  (nur `src/photos/.gitkeep`); in der gesamten History liegt kein Bild
- Wer Fotos privat halten will, braucht ein privates Repo — dann entfallen die
  Wege 2 und 3, weil beide aus dem Repo bauen

## Ansätze

**A — Ein Shell-Skript, protokollunabhängig, mit `deploy.env` (gewählt).**
`scripts/deploy.sh` liest Konfiguration aus der Umgebung, baut daraus einen
`lftp`-Aufruf mit `mirror -R` und überträgt `_site`. `lftp` spricht SFTP und
FTP mit demselben Code, Passwörter kommen über `LFTP_PASSWORD` und tauchen
nicht in der Prozessliste auf. Ein Skript, ein Konfigurationssatz, npm-Skripte
als Eingang. Nachteil: Shell läuft nicht unter Windows (irrelevant) und ein
Fremdwerkzeug (`lftp`) ist nötig.

**B — Zwei Skripte, `rsync` und `sftp` (verworfen).** `rsync` ist robuster und
schneller, scheidet hier aber aus, weil der Webspace keine Shell bietet. Ein
`rsync`-Skript läge als toter Code im Repo, und `sftp` im Batch-Modus kann
weder spiegeln noch löschen noch unveränderte Dateien überspringen.

**C — Fertige Tools (`netlify-cli`, Deploy-Actions von Dritten, `gh-pages`)
(verworfen).** Am wenigsten eigener Code, aber Fremdcode im Deploy-Pfad zu
privaten Fotos und zusätzliche Abhängigkeiten im Projekt, das bewusst ohne
Framework auskommt. Netlify bleibt als Weg erhalten, aber über die
Git-Integration von Netlify, nicht über eine CLI im Repo.

## Der manuelle Weg (Weg 1)

```
deploy.env.example     Vorlage mit allen Variablen, im Repo
deploy.env             echte Zugangsdaten, per .gitignore ausgeschlossen
scripts/deploy.sh      Trockenlauf-fähiges Spiegel-Skript
```

Variablen (alle in `deploy.env.example` erklärt):

| Variable | Bedeutung |
|---|---|
| `DEPLOY_PROTOCOL` | `sftp`, `ftp` oder `ftps` |
| `DEPLOY_HOST`, `DEPLOY_PORT` | Server; Port optional (22 bei sftp, 21 bei ftp) |
| `DEPLOY_USER`, `DEPLOY_PASSWORD` | Zugang |
| `DEPLOY_PATH` | Zielordner, z. B. `/htdocs/galerie` |
| `DEPLOY_SOURCE` | was hochgeladen wird, Standard `_site` |
| `DEPLOY_DELETE` | `1` löscht serverseitig, was lokal fehlt; Standard `0` |
| `DEPLOY_SSH_KEY` | optional: Pfad zu einem Key für SFTP statt Passwort |

Verhalten: fehlende Variablen brechen mit klarer Meldung ab, `lftp` wird auf
Vorhandensein geprüft, das Passwort wird nie ausgegeben. Aufruf über
`npm run deploy` und `npm run deploy:dry`; das Skript ist auch direkt
aufrufbar, damit Actions denselben Code nutzt wie der Mensch.

## Der automatische Weg (Weg 2)

```
.github/workflows/deploy.yml
```

Auslöser: Push auf `main`, dazu `workflow_dispatch`. Schritte: auschecken,
Node einrichten, `npm ci`, **`npm test`** (bricht der Test ab, wird nicht
veröffentlicht), `npm run build`, `.cache/eleventy-img` über `actions/cache`
sichern bzw. wiederherstellen, `lftp` installieren, `scripts/deploy.sh`
ausführen. Zugangsdaten als Repo-Secrets (`DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_PASSWORD`, `DEPLOY_PATH`, `DEPLOY_PROTOCOL`, optional `DEPLOY_PORT`,
`DEPLOY_SSH_KEY`, `DEPLOY_DELETE`). Keine Action von Dritten außer `checkout`,
`setup-node` und `cache`.

## Der Netlify-Weg (Weg 3)

```
netlify.toml    Build-Befehl, Publish-Ordner, Node-Version
```

Netlify baut bei jedem Push selbst; die Verbindung entsteht in der
Netlify-Oberfläche, nicht im Repo. Ehrlich benannt: Netlify rechnet Bilder bei
einem kalten Build neu (`.cache/eleventy-img` liegt nicht zwischen den Builds),
ein großer Bestand braucht dort beim ersten Mal spürbar länger.

## README

Neu gegliedert, mit Beispielen statt Andeutungen:

1. Was das ist, ein Absatz, plus Hinweis auf das öffentliche Vorlagen-Repo
2. Schnellstart (klonen, `npm install`, `npm run serve`)
3. Ein Album anlegen (bestehender Inhalt, bleibt)
4. Lokal bauen und ansehen
5. **Öffentlich oder privat** — was dieses Repo ist (öffentliche Vorlage), was
   das für Fotos bedeutet (öffentlich auf GitHub, auch in der History), und
   wann man stattdessen ein privates Repo nimmt; Folgen für die drei Wege
6. **Veröffentlichen** — Entscheidungstabelle „welcher Weg wann", dann je Weg:
   Voraussetzungen, Befehle zum Kopieren, wo die Zugangsdaten liegen, was
   schiefgehen kann
7. Bilddaten und GPS (bestehender Inhalt, bleibt)
8. **Was `noindex` leistet und was nicht** — hält Suchmaschinen fern, nicht
   Besucher mit der URL, nicht GitHub und nicht Netlify
9. Tests, Projektstruktur, Design-Dokumente

## Tests

Neue Tests nach dem Muster der bestehenden `node --test`-Suite:

- `deploy.env.example` nennt jede Variable, die `scripts/deploy.sh` liest —
  sonst laufen Vorlage und Skript auseinander
- `deploy.env` ist in `.gitignore` ausgeschlossen, `deploy.env.example` nicht
- `scripts/deploy.sh` ist syntaktisch gültig (`bash -n`) und ausführbar
- `netlify.toml` veröffentlicht `_site` und baut mit `npm run build`
- `deploy.yml` führt `npm test` aus, bevor veröffentlicht wird, und bezieht
  seine Zugangsdaten aus `secrets`

## Dem Builder überlassen

- Genaue Wortwahl und Länge der README-Abschnitte
- `--parallel`-Wert, `mirror`-Details, Umgang mit `.htaccess` auf dem Server
- Ob zusätzlich ein `Makefile` oder weitere npm-Skripte sinnvoll sind (nein)
- Reihenfolge der Commits
- Wie deutlich die README vor öffentlichen Fotos warnt (Empfehlung: an einer
  Stelle, klar, ohne Dramatik)
