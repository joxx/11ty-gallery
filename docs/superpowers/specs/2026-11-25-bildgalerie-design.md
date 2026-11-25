# Bildgalerie mit Eleventy — Design

Datum: 2026-11-25
Status: Entwurf zur Freigabe

## Absicht

Eine statische Bildgalerie, die aus Ordnern mit Fotos entsteht. Ein Ordner
unter `src/photos/` ist ein Album; ein neuer Ordner wird beim nächsten Build
automatisch zu einer neuen Albumseite. Die Bilder werden gezeigt, nicht
verwaltet: keine Upload-Oberfläche, kein CMS.

Warum statisch: Fotos ändern sich selten, Besucher sollen nur schauen. Ein
Build erzeugt HTML und fertige Bildvarianten, die ohne Server-Logik und ohne
Datenbank ausgeliefert werden.

## Ziele

- Ordner → Album, ohne Konfiguration pro Album (`src/photos/urlaub-2024/` → `/alben/urlaub-2024/`)
- Albenübersicht mit Titelbild, Albumseite als Bildraster, je Foto eine eigene Seite
- Bildunterschriften und Aufnahmedaten (Datum, Kamera, Objektiv, Blende, Belichtungszeit, ISO, Brennweite), sofern im Bild vorhanden
- Responsive Bilder in mehreren Breiten, AVIF mit WebP- und JPEG-Rückfall über `<picture>`
- Barrierefrei: Alternativtexte, sinnvolle Fokusführung, Tastaturbedienung, keine Inhalte, die ohne Maus unerreichbar sind
- Vanilla CSS, kein Framework, keine Build-Tools außer Eleventy selbst
- Funktionierend ohne JavaScript

## Nicht-Ziele

- Kein Upload, Löschen, Umbenennen oder Taggen über die Website
- Keine Suche, keine Schlagworte, keine Sammlungen über Ordner hinaus
- Keine Lightbox in Version 1 (siehe „Entscheidungen des Builders")
- Kein CMS, keine Mehrsprachigkeit, kein Tracking
- Keine Videos, keine clientseitige Bildverarbeitung

## Anti-Ziele

Diese Ergebnisse gelten als Fehlschlag, auch wenn die Seite technisch läuft:

- Bilder sind ohne JavaScript nicht erreichbar
- Bilder ohne Alternativtext oder mit erfundenem Alternativtext
- Sichtbares Springen des Layouts beim Laden (fehlende Maße, falsche Reservierung)
- Jeder Build verarbeitet alle Fotos neu, obwohl sich nichts geändert hat
- Abhängigkeit von einem externen Bilddienst oder CDN
- Ein Foto ist nur über eine Mausgeste erreichbar

## Randbedingungen

- 40–60 Bilder pro Album; Gesamtmenge wächst durch neue Ordner
- Quellbilder liegen als JPEG/PNG/TIFF vor, Auflösung unbekannt, keine Vorverarbeitung
- Node ≥ 20, Eleventy 3.x (ESM-Konfiguration)
- Build-Umgebung muss `sharp` installieren können (lokal, Netlify, GitHub Actions — überall üblich)
- Bildunterschriften und Alternativtexte dürfen nicht automatisch erfunden werden

## Ansätze

**A — Alles beim Eleventy-Build (gewählt).** Ein Data-File scannt
`src/photos/`, liest EXIF, und `@11ty/eleventy-img` erzeugt beim Build alle
Varianten. Ein Befehl, eine Pipeline, kein Zustand, der auseinanderlaufen kann.
Eleventy-img cached nach Bildinhalt, neue Ordner kosten daher nur die
Verarbeitung der neuen Fotos. Kosten: `sharp` in der Build-Umgebung, EXIF wird
pro Build gelesen (bei 60 Bildern Millisekunden).

**B — Vorverarbeitung in einem eigenen Skript.** Skript schreibt
`albums.json` plus fertige Varianten, Eleventy liest nur das JSON. Schnellere
Builds, aber zwei Schritte, die man vergessen kann; Manifest und Ordner laufen
auseinander, Fehler zeigen sich als fehlende Bilder. Bei 60 Bildern kein
Gegenwert.

**C — Bild-CDN (Cloudinary, imgix).** Kein Build-Aufwand, aber Konto, Kosten,
Abhängigkeit von außen und Bilder bei einem Dritten. Widerspricht dem
Anti-Ziel der externen Abhängigkeit.

Gewählt wurde A, weil es die geringste Anzahl beweglicher Teile hat und der
Bildbestand klein genug ist, dass Build-Zeit kein Argument gegen A spricht.

## Aufbau

```
eleventy.config.js
package.json
src/
  index.njk                  Albenübersicht
  album.njk                  eine Seite pro Album
  foto.njk                   eine Seite pro Foto
  _data/
    albums.js                Alben inkl. Bild-Metadaten
    fotos.js                 flache Fotoliste für foto.njk
  _lib/
    galerie.js               Scan, EXIF, Bildverarbeitung (einmal pro Build)
  _includes/
    base.njk                 Grundgerüst: lang, Kopf, Sprungmarke, Kopf-/Fußzeile
    raster.njk               wiederverwendbares Bildraster
    exif.njk                 Aufnahmedaten als Beschreibungsliste
  assets/
    style.css
  photos/
    urlaub-2024/
      captions.json          optional: Alternativtexte und Unterschriften
      info.json              optional: Titel und Beschreibung des Albums
      001.jpg
      002.jpg
```

`src/_lib/galerie.js` enthält die gesamte Logik und merkt sich das Ergebnis in
einer Modul-Variable. `albums.js` und `fotos.js` importieren dieses Modul, so
dass der Ordner pro Build genau einmal gescannt und jedes Bild genau einmal
verarbeitet wird.

## Verhalten

**Album-Erkennung.** Jeder Unterordner von `src/photos/` ist ein Album. Der
Slug ist der Ordnername (`urlaub-2024`). Der Titel kommt aus `info.json`
(`title`), sonst aus dem Ordnernamen: Bindestriche zu Leerzeichen, jedes Wort
mit großem Anfangsbuchstaben (`urlaub-2024` → „Urlaub 2024"). Ordner, die mit
`_` beginnen, werden übersprungen. Die Beschreibung kommt aus `info.json` (`description`), sonst keine.
Alben werden alphabetisch nach Slug sortiert.

**Fotos in einem Album.** Alle Dateien mit Bildendung, sortiert nach
Dateiname. `001.jpg`, `002.jpg` … ergibt also die gewünschte Reihenfolge; das
erste Foto ist das Titelbild. Der Foto-Slug ist der Dateiname ohne Endung.
Unterordner innerhalb eines Albums werden ignoriert (keine Verschachtelung),
Dateien ohne Bildendung ebenfalls. Ein Album ohne Bilder erzeugt keine Seite
und erscheint nicht in der Übersicht.

*Builder-Entscheidung:* Lässt sich eine Bilddatei nicht lesen, wird sie mit
Warnung auf der Konsole übersprungen, statt den Build abzubrechen — ein
kaputtes Foto soll die anderen 59 nicht blockieren.

*Builder-Entscheidung:* Originaldateien werden nicht zum Download angeboten,
nur die erzeugten Varianten. Downloads waren kein Ziel, und Originale können
sehr groß sein.

**Bildunterschriften und Alternativtexte.** Beides kommt aus
`captions.json` im Albumordner:

```json
{
  "001.jpg": { "alt": "Strand bei Ebbe, im Hintergrund zwei Kite-Segel", "caption": "Erster Morgen" }
}
```

Fehlt der Eintrag, gilt: `caption` bleibt leer, `alt` wird aus dem Dateinamen
abgeleitet, wenn dieser beschreibend ist (`strand-ebbe.jpg` → „Strand ebbe").
Ist der Dateiname eine Kamera-Vorgabe (`IMG_1234`, `DSC_…`, `PXL_…`), lautet
der Alternativtext „Foto {n} von {m} im Album {Titel}" — sachlich richtig,
nicht erfunden, und für Screenreader-Nutzer brauchbar. Es wird nie ein
Alternativtext aus EXIF-Daten oder Bildinhalten geraten.

**Aufnahmedaten.** Gelesen mit `exifr`. Angezeigt werden nur vorhandene
Felder, in fester Reihenfolge: Datum (deutsches Format), Kamera
(Hersteller + Modell), Objektiv, Blende, Belichtungszeit, ISO, Brennweite.
Fehlt alles, entfällt der Block vollständig — kein leerer Rahmen, keine
„unbekannt"-Zeilen. GPS-Daten werden nie ausgelesen und nie ausgegeben; die
neu erzeugten Varianten enthalten durch `sharp` ohnehin keine Metadaten.

**Bildvarianten.** Pro Foto ein Satz Varianten über `@11ty/eleventy-img`:
Breiten 400, 800, 1200, 1600 px, Formate AVIF, WebP, JPEG, Ausgabe nach
`_site/img/` mit inhaltsbasierten Dateinamen (dadurch unbegrenzt
cache-fähig). Im Raster und auf der Fotoseite wird dasselbe Varianten-Set mit
unterschiedlichem `sizes`-Attribut verwendet, also wird jedes Foto nur einmal
verarbeitet. `width`/`height` stehen im Markup, damit nichts springt.

**Seiten.**

- `/` — Albenübersicht: je Album Titelbild, Titel, Bildanzahl, optional Beschreibung
- `/alben/{slug}/` — Bildraster des Albums, jedes Bild verlinkt auf seine Fotoseite, Unterschrift als `figcaption` unter dem Bild
- `/alben/{slug}/{foto}/` — großes Bild, Unterschrift, Aufnahmedaten, „Zurück zum Album", „vorheriges Foto", „nächstes Foto"

**Laden.** Alle Bilder außer dem Titelbild und dem ersten Rasterbild nutzen
`loading="lazy"` und `decoding="async"`. Titelbild bekommt
`fetchpriority="high"`.

**Ohne JavaScript.** Alle Seiten sind vollständig; die Fotoseite ist der
Ersatz für eine Lightbox. Es gibt in Version 1 kein JavaScript im Projekt.

**Neue Alben im Entwicklungsbetrieb.** `src/photos` wird als Watch-Target
registriert, damit ein neuer Ordner bei `--serve` einen Rebuild auslöst.

## Barrierefreiheit

- `lang="de"`, eindeutige `h1` pro Seite, Sprungmarke „Zum Inhalt" als erstes fokussierbares Element
- Kopf-, Haupt- und Fußbereich als Landmarken
- Bilder in `<figure>`/`<figcaption>`, Unterschrift nicht zusätzlich als `alt`-Ersatz missbraucht
- Sichtbarer Fokusring über `:focus-visible`, nie `outline: none` ohne Ersatz
- Linktexte beschreibend („Vorheriges Foto: Erster Morgen"), nicht „weiter"
- Text-Kontrast mindestens 4.5:1 gegen den Hintergrund, auch für Unterschriften und EXIF-Zeilen
- Ziele großzügig (Raster-Links mindestens 44×44 px Trefferfläche)
- `prefers-reduced-motion` wird respektiert, falls Übergänge eingesetzt werden
- Raster skaliert per `grid-template-columns: repeat(auto-fill, minmax(…))` und bleibt bei 200 % Zoom ohne horizontales Scrollen nutzbar

## CSS

Eine Datei, `src/assets/style.css`, per Passthrough kopiert. Custom Properties
für Farben, Abstände, Rasterbreite. Systemschriften, kein Webfont. Ein
Umschaltpunkt ist nicht nötig, das Raster ergibt sich aus `auto-fill` mit
`minmax`.

## Build und Betrieb

```
npm run build   # rm -rf _site && eleventy
npm run serve   # eleventy --serve
```

`_site` wird vor jedem Build geleert, damit gelöschte Fotos keine
Waisen-Dateien hinterlassen; die bereits verarbeiteten Varianten liegen im
Cache `.cache/eleventy-img` und werden nur kopiert, nicht neu gerechnet.

## Getroffene Builder-Entscheidungen (zum Prüfen)

- Unlesbare Bilddatei: Warnung und überspringen, kein Abbruch
- Keine Verschachtelung, keine Original-Downloads, Alben mit `_`-Präfix übersprungen
- Leeres Album: keine Seite, nicht in der Übersicht
- Kein JavaScript in Version 1; die Fotoseite ist der Ersatz für eine Lightbox
- `_site` wird vor jedem Build geleert, Cache bleibt erhalten

## Offene Punkte, die nicht der Builder entscheidet

- Für wen die Galerie öffentlich ist und ob sie von Suchmaschinen gefunden werden soll (beeinflusst `robots.txt`/`noindex`, nicht den Aufbau)
- Wo sie gehostet wird

## Dem Builder überlassen

- Konkrete Breitenstaffel und `sizes`-Werte, sofern sie zum Raster passen
- Genaue Gestaltung: Abstände, Farben, Typografie, Hover-Zustände
- Ob eine Lightbox später als progressive Erweiterung ergänzt wird (eigene Entscheidung, nicht Teil dieses Designs)
- Ob die Albenübersicht nach Datum statt alphabetisch sortiert
- Ob `_site` zusätzlich per `robots.txt`/`sitemap` ergänzt wird
