/**
 * SYNTHETIC LinkedIn profile PDFs («Save to PDF»), described as positioned lines: no real person, no real LinkedIn file.
 * The geometry imitates the printed layout the import reads (a left column at x 30, the main column at x 220 on a US
 * Letter page, the name at 26 pt, section headings larger than the body), so the same description drives the unit tests
 * (as pdf.js-like runs) and the e2e (as a real PDF built by test/import-pdf-helper.ts and read by pdf.js in Chromium).
 */
import type { PdfPageRuns } from '../../../src/components/jobs/intake/pdf.ts';

export interface LayoutLine {
  col: 'side' | 'main';
  size: number;
  text: string;
  /** Extra space above the line, in points (a new paragraph). */
  gap?: number;
}
export interface PlacedRun {
  x: number;
  y: number;
  size: number;
  text: string;
}

export const PAGE = { width: 612, height: 792 } as const;
const X = { side: 30, main: 220 } as const;

/** Lines → runs with coordinates: each column flows down from the top on its own. A footer sits at y 30. */
export function place(lines: readonly LayoutLine[], footer?: string): PlacedRun[] {
  const y = { side: 750, main: 750 };
  const out: PlacedRun[] = [];
  for (const l of lines) {
    y[l.col] -= l.size * 1.25 + (l.gap ?? 0);
    out.push({ x: X[l.col], y: y[l.col], size: l.size, text: l.text });
  }
  if (footer) out.push({ x: 280, y: 30, size: 9, text: footer });
  return out;
}

/** Placed runs → what pdf.js reports (width estimated at half an em per character). */
export function toRuns(pages: readonly PlacedRun[][]): PdfPageRuns[] {
  return pages.map((runs) => ({ ...PAGE, runs: runs.map((r) => ({ str: r.text, x: r.x, y: r.y, size: r.size, width: r.text.length * r.size * 0.5, eol: true })) }));
}

const side = (size: number, text: string, gap = 0): LayoutLine => ({ col: 'side', size, text, gap });
const main = (size: number, text: string, gap = 0): LayoutLine => ({ col: 'main', size, text, gap });

/** English interface. Page 1 holds both columns; Education continues on page 2. */
export const LINKEDIN_PDF_EN: PlacedRun[][] = [
  place(
    [
      side(13, 'Contact'),
      side(10.5, 'ana.ejemplo@example.test'),
      side(10.5, '+52 55 0000 0000 (Mobile)'),
      side(10.5, 'www.linkedin.com/in/ana-'),
      side(10.5, 'ejemplo-0000 (LinkedIn)'),
      side(10.5, 'ana.example.test (Portfolio)'),
      side(13, 'Top Skills', 8),
      side(10.5, 'Python'),
      side(10.5, 'SQL'),
      side(10.5, 'Data modeling'),
      side(13, 'Languages', 8),
      side(10.5, 'Spanish (Native or Bilingual)'),
      side(10.5, 'English (Full Professional)'),
      side(13, 'Certifications', 8),
      side(10.5, 'Data Analyst Associate'),
      side(13, 'Honors-Awards', 8),
      side(10.5, 'Best Thesis Award'),
      side(13, 'Patents', 8),
      side(10.5, 'SENTINEL patent never read'),
      main(26, 'Ana Ejemplo'),
      main(12, 'Data engineer at Cooperativa Ejemplo | SQL, Python'),
      main(10.5, 'Cuernavaca, Morelos, Mexico'),
      main(15.75, 'Summary', 10),
      main(10.5, 'Data engineer who turns messy spreadsheets into reliable'),
      main(10.5, 'pipelines.'),
      main(10.5, 'Second paragraph of the summary.', 12),
      main(15.75, 'Experience', 10),
      main(12, 'Cooperativa Ejemplo'),
      main(10.5, '3 years 2 months'),
      main(11.5, 'Data Engineer'),
      main(10.5, 'January 2023 - Present (1 year 11 months)'),
      main(10.5, 'Cuernavaca, Morelos, Mexico'),
      main(10.5, 'Built the nightly ETL in Python.'),
      main(11.5, 'Data Analyst', 6),
      main(10.5, 'October 2021 - December 2022 (1 year 3 months)'),
      main(10.5, 'Reports for the board.'),
      main(12, 'Fondo Ejemplo', 8),
      main(11.5, 'Intern'),
      main(10.5, 'June 2020 - August 2020 (3 months)'),
      main(10.5, 'Remote'),
    ],
    'Page 1 of 2',
  ),
  place(
    [
      main(15.75, 'Education'),
      main(12, 'Universidad Ejemplo'),
      main(10.5, 'Bachelor of Engineering, Computer Science · (2016 - 2020)'),
      main(12, 'Instituto Ejemplo', 6),
      main(10.5, '(2013 - 2016)'),
    ],
    'Page 2 of 2',
  ),
];

/** Spanish interface, with the accented letters LOST (LinkedIn: the PDF supports only English characters). */
export const LINKEDIN_PDF_ES_LOSSY: PlacedRun[][] = [
  place(
    [
      side(13, 'Contactar'),
      side(10.5, 'luis.ejemplo@example.test'),
      side(13, 'Aptitudes principales', 8),
      side(10.5, 'Excel'),
      side(13, 'Idiomas', 8),
      side(10.5, 'Espa ol (Competencia nativa o biling e)'),
      side(10.5, 'Ingl s (Competencia b sica)'),
      main(26, 'Luis Ejemplo'),
      main(12, 'Contador en Despacho Ejemplo'),
      main(10.5, 'rea metropolitana de Guadalajara'),
      main(15.75, 'Extracto', 10),
      main(10.5, 'Contador con experiencia en n mina.'),
      main(15.75, 'Experiencia', 10),
      main(12, 'Despacho Ejemplo'),
      main(10.5, '2 a os 1 mes'),
      main(11.5, 'Contador'),
      main(10.5, 'enero de 2023 - actualidad (1 a o 11 meses)'),
      main(10.5, 'Guadalajara, Jalisco, M xico'),
      main(11.5, 'Auxiliar contable', 6),
      main(10.5, 'octubre de 2022 - diciembre de 2022 (3 meses)'),
      main(15.75, 'Educaci n', 10),
      main(12, 'Universidad Ejemplo de Jalisco'),
      main(10.5, 'Licenciatura, Contadur a · (2018 - 2022)'),
    ],
    'P gina 1 de 1',
  ),
];
