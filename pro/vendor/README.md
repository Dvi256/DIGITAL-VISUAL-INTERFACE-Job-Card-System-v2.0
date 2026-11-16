# Bundled libraries (Download PDF)

Used only by **Download PDF** (`downloadJobPdf` in `dist/app.js`), which loads them the first time someone
downloads a PDF. They are stored here so the installed app loads nothing from the internet. These are the
same versions the live DVI v2.0 system (Classic) loads from cdnjs.

| File | Library | Version | Bytes | SHA-256 | Licence |
|---|---|---|---|---|---|
| `html2canvas.min.js` | html2canvas, Niklas von Hertzen | 1.4.1 | 198,689 | `e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb` | MIT (notice at the top of the file) |
| `jspdf.umd.min.js` | jsPDF, James Hall and others | 2.5.1 | 364,463 | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` | MIT (notice at the top of the file) |

Downloaded on 15 November 2026 from:

- https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
- https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js

Each file matched the SHA-512 integrity hash cdnjs publishes for it (api.cdnjs.com). Do not edit them; to
upgrade, replace both, record the new versions and hashes here, and check Download PDF again.
