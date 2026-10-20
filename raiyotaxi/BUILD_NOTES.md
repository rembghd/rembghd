# BUILD NOTES — Raiyo Taxi Showcase Site (raiyotaxi.de)

Spec-Demo für „Rai yo taxi service", Norderstedt. Reine statische Seite
(handgeschriebenes HTML/CSS + wenig Vanilla-JS, keine Frameworks, kein Build-Schritt).
Kann 1:1 auf Cloudflare Pages (oder jeden statischen Hoster) hochgeladen werden.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Die komplette einseitige Website (CSS & JS eingebettet) |
| `favicon.svg` | Taxi-gelbes „R"-Zeichen mit Schachbrett-Akzent |
| `robots.txt` | Alle Crawler erlaubt, verweist auf die Sitemap |
| `sitemap.xml` | Genau eine URL: https://raiyotaxi.de/ |
| `BUILD_NOTES.md` | Diese Datei |

## Inhalt der Seite (alles auf Deutsch, lang="de")

- **Sticky Header:** Logo, Navigation (Leistungen, Buchung, Einsatzgebiet, FAQ, Kontakt),
  Anruf-Button mit der Rufnummer.
- **Hero:** H1 „Taxi Norderstedt – rund um die Uhr für Sie da.", Subline,
  große CTAs (Anrufen / Per WhatsApp buchen), Vertrauens-Zeile:
  24/7-Service · „5,0 von 5 Sternen auf Google" (5 Bewertungen) · Festpreis-Anfrage.
- **Leistungen:** Stadtfahrten, Flughafentransfer Hamburg (Festpreis auf Anfrage),
  Geschäftsfahrten, Fern- & Kurierfahrten (auf Anfrage).
- **WhatsApp-Buchung:** Formular (Abholort, Ziel, Datum, Uhrzeit, Personenanzahl).
  JavaScript setzt daraus eine deutsche Buchungsnachricht zusammen und öffnet
  `wa.me/491729666466` mit vorbefülltem Text. Kein Backend, keine Datenbank.
- **Warum Raiyo Taxi:** Professionelle Fahrer, Pünktlich & zuverlässig,
  Alle Zahlungsarten, Einfache Buchung.
- **Einsatzgebiet:** Norderstedt, Hamburg, Flughafen Hamburg, Quickborn, Ellerbek,
  Henstedt-Ulzburg, Kaltenkirchen, Bönningstedt, Hasloh, Nahe.
- **FAQ:** 5 Fragen (Buchung, Preis Flughafen Hamburg → „Festpreis auf Anfrage",
  keine erfundenen Preise; Kartenzahlung, Nachtfahrten, Vorbestellung).
- **Kontakt/Footer:** Adresse Falkenhorst 61, Norderstedt, große Rufnummer,
  Anruf- und WhatsApp-Buttons, Impressum-Block.
- **Mobile Aktionsleiste:** Fixiert am unteren Bildschirmrand (Anrufen | WhatsApp),
  nur auf kleinen Bildschirmen sichtbar.

## SEO / Technik (alles, was der alten Seite fehlte)

- Aussagekräftiger deutscher `<title>` mit „Taxi Norderstedt"
- Deutsche Meta-Description mit Keyword, 24/7, Flughafentransfer und Rufnummer
- Canonical auf https://raiyotaxi.de/, Open-Graph-Tags, `og:locale` de_DE
- JSON-LD-Schema (TaxiService/LocalBusiness): Name, URL, Telefon, Adresse
  (ohne PLZ – siehe Platzhalter), areaServed, Öffnungszeiten 24/7,
  aggregateRating 5.0 / 5 Bewertungen
- robots.txt + sitemap.xml, deutsche Alt-/ARIA-Texte, semantisches HTML
- Design: dunkles Anthrazit + Taxi-Gelb, Mobile-first, große Touch-Ziele,
  dezente Scroll-Reveal-Animationen, `prefers-reduced-motion` wird respektiert
- Performance: keine externen Bilder (nur CSS/SVG), nur eine Google-Font
  (Manrope, display=swap)

## ⚠️ Platzhalter (vor dem Livegang ergänzen!)

Im HTML als Kommentar im Footer markiert (`<!-- PLATZHALTER ... -->`).
Es wurden **keine** Daten erfunden:

1. **Name des Inhabers / Vertretungsberechtigten** fehlt im Impressum
   (gesetzlich erforderlich).
2. **Postleitzahl** der Anschrift fehlt – bewusst überall weggelassen,
   auch im Schema (Adresse aktuell: Falkenhorst 61, Norderstedt, ohne PLZ).
3. **E-Mail-Adresse** fehlt (weder im Impressum noch im Kontaktbereich).
4. **USt-IdNr.** fehlt, falls vorhanden.
5. Ggf. **zuständige Genehmigungsbehörde** für den Taxiverkehr ins Impressum.

Erst nach Ergänzung dieser Angaben ist das Impressum vollständig.

## Go-Live-Schritte

1. Domain **raiyotaxi.de** auf Cloudflare hinzufügen (Site hinzufügen, Free-Plan).
2. Bei Namecheap die Nameserver auf die von Cloudflare zugewiesenen ändern.
3. Cloudflare Pages: „Create → Upload assets" und **den gesamten Inhalt dieses
   Ordners** (ohne BUILD_NOTES.md) hochladen, Projekt z. B. `raiyotaxi` nennen.
   Alternativ: Pages-Projekt mit dem Repository verbinden.
4. In Pages unter „Custom domains" **raiyotaxi.de** (und optional www.raiyotaxi.de)
   hinzufügen – Cloudflare legt die DNS-Einträge automatisch an, SSL inklusive.
5. **Links testen:** Anruf-Buttons (`tel:+491729666466`) und WhatsApp-Buttons
   (`https://wa.me/491729666466`, inkl. Testbuchung über das Formular) einmal
   vom Handy aus durchklicken.
6. Prüfen: https://raiyotaxi.de/robots.txt und /sitemap.xml sind erreichbar.
7. Platzhalter oben ergänzen, dann in der Google Search Console einreichen
   (Sitemap übermitteln) und die neue Domain im Google-Unternehmensprofil
   als Website hinterlegen.
