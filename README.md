# Bildergalerie

Eine statische Bildgalerie mit Eleventy. Jeder Ordner unter `src/photos/` ist
ein Album; ein neuer Ordner wird beim nächsten Build automatisch zu einer
neuen Albumseite.

## Voraussetzungen

- Node.js ≥ 20
- einmalig `npm install` (installiert Eleventy, `sharp` und `exifr`)

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

## Bauen und ansehen

```bash
npm run build   # erzeugt _site/
npm run serve   # Entwicklungsserver mit automatischem Neuladen
```

Beim ersten Build werden die Bilder nach AVIF, WebP und JPEG in vier Breiten
umgerechnet; das dauert bei einem neuen Album einige Sekunden. Alles bereits
Verarbeitete liegt in `.cache/eleventy-img` und wird bei späteren Builds nur
kopiert — ein neues Album kostet nur die neuen Fotos.

## Hochladen

Den Inhalt von `_site/` per FTP/SFTP oder rsync auf den Webspace übertragen.
Zugangsdaten gehören nicht ins Repo.

Die Galerie ist auf `noindex` gesetzt: `robots.txt` verbietet allen Bots alles,
und jede Seite trägt `<meta name="robots" content="noindex, nofollow">`.
Das hält Suchmaschinen fern, aber keine Besucher, die die URL kennen.

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

## Aufbau

```
eleventy.config.js   Konfiguration, Vorlagen-Globals, GPS-Prüfung
src/_lib/galerie.js  Ordner scannen, EXIF lesen, Bildvarianten erzeugen
src/_data/           Alben und Fotos als Vorlagen-Daten
src/index.njk        Albenübersicht
src/album.njk        eine Seite pro Album
src/foto.njk         eine Seite pro Foto
src/assets/style.css das gesamte CSS
```

Design und Umsetzungsplan liegen unter `docs/superpowers/`.
