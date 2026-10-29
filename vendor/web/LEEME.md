# Librerías y fuentes incluidas

La aplicación no descarga nada de internet: todo lo que necesita viaja con ella.

| Archivo | Origen | Versión | Licencia |
|---|---|---|---|
| supabase.min.js, 591.supabase.js | @supabase/supabase-js (npm) | 2.45.4 | MIT |
| xlsx.full.min.js | SheetJS Community Edition, CDN oficial `https://cdn.sheetjs.com/xlsx-0.20.3/` (ya no se publica en npm) | 0.20.3 | Apache 2.0 |
| fontawesome/ | @fortawesome/fontawesome-free (npm) | 6.4.0 | Íconos CC BY 4.0, fuentes SIL OFL 1.1, código MIT |
| pdf.min.js, pdf.worker.min.js | pdfjs-dist (npm), lector de PDF de Mozilla | 3.11.174 | Apache 2.0 |
| fuentes/ (Archivo, Inter, JetBrains Mono) | @fontsource-variable (npm) | — | SIL Open Font License 1.1 |

**SheetJS 0.20.3** corrige CVE-2023-30533 y CVE-2024-22363 (presentes en las versiones anteriores a 0.20.2). Se obtuvo por HTTPS de
`https://cdn.sheetjs.com/xlsx-0.20.3/`; SheetJS no publica huellas oficiales, así que se verificó con dos descargas
independientes y comparando el archivo suelto con el del paquete. Huellas registradas:
- `xlsx.full.min.js`: SHA-256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
- `../npm/xlsx-0.20.3.tgz` (paquete para las pruebas en Node, no se publica): SHA-256
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. `package-lock.json` guarda su SHA-512.

Esta carpeta se publica junto a index.html (carpeta `vendor/`). La aplicación y el service worker la usan con rutas relativas, así que funciona igual en GitHub Pages o en un servidor de la Alcaldía sin salida a internet.
