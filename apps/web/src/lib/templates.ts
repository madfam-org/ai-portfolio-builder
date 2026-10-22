/**
 * The template registry (W4-T): which templates each artifact kind offers, their labels and their honest
 * trade-offs, es-MX and en. The SINGLE source for:
 * - the API's allowlist (`server/api/validation.ts`: a template outside its kind's list is a 400; stored rows that
 *   predate the allowlist still render, falling back to `base`),
 * - the renderer registry (`components/render/ArtifactView.tsx` maps every id here to a view; a unit test keeps the
 *   two in step),
 * - the pickers (the tailoring workspace and `/documentos/:id`).
 *
 * Rules every template keeps (lane X §4, W3-4): React text only, http(s) user links with
 * rel="ugc nofollow noopener noreferrer", no images, no inline style (CSS Modules), nothing invented. Every CV
 * template is ONE column of real text under semantic headings, with no layout tables and no images, so ATS parsers
 * read all of them; they differ only in typography and density. A two-column or graphic CV is deliberately absent.
 *
 * No React and no server import (relative `.ts` type imports only): the server, the client and `node --test` all
 * load it directly. Append-only: an id, once stored in rows, is never removed or renamed.
 */
import type { ArtifactKind } from './copy/app.ts';
import type { Locale } from './routing.ts';

export const DEFAULT_TEMPLATE = 'base';

type Localized = Readonly<Record<Locale, string>>;

export interface TemplateInfo {
  id: string;
  label: Localized;
  /** What it looks like and what it trades off, in one sentence. */
  description: Localized;
  /** The ATS line, CV and cover letter only (null where ATS parsing does not apply). */
  ats: Localized | null;
}

const ATS_FIRST: Localized = {
  es: 'Pensado para sistemas ATS: una columna, texto real y encabezados estándar.',
  en: 'Built for ATS: one column, real text and standard headings.',
};
const ATS_SAFE: Localized = {
  es: 'Compatible con sistemas ATS: la misma estructura de una columna que la básica; sólo cambia la tipografía.',
  en: 'ATS-safe: the same one-column structure as the basic template; only the typography changes.',
};

export const TEMPLATE_REGISTRY: Readonly<Record<ArtifactKind, readonly TemplateInfo[]>> = {
  cv: [
    {
      id: 'base',
      label: { es: 'Básica', en: 'Basic' },
      description: {
        es: 'Una columna, letra del sistema y espacio generoso. La opción más segura para postular en línea.',
        en: 'One column, system fonts and generous spacing. The safest choice for online applications.',
      },
      ats: ATS_FIRST,
    },
    {
      id: 'compacto',
      label: { es: 'Compacta', en: 'Compact' },
      description: {
        es: 'Una columna más densa: letra más pequeña y menos espacio, para que quepa más en cada página. A cambio, se lee con menos aire.',
        en: 'A denser single column: smaller type and tighter spacing, so more fits on each page. The trade-off: less breathing room.',
      },
      ats: ATS_SAFE,
    },
    {
      id: 'clasico',
      label: { es: 'Clásica', en: 'Classic' },
      description: {
        es: 'Jerarquía tipográfica tradicional, con letra con remates (serif) y encabezado centrado, en una sola columna. Ocupa un poco más que la básica.',
        en: 'A traditional typographic hierarchy, serif type and a centred header, in a single column. It runs slightly longer than the basic one.',
      },
      ats: ATS_SAFE,
    },
  ],
  portfolio: [
    {
      id: 'base',
      label: { es: 'Tarjetas', en: 'Cards' },
      description: {
        es: 'Proyectos y experiencia como tarjetas, en dos columnas en pantallas anchas; al imprimir, una columna.',
        en: 'Projects and experience as cards, two columns on wide screens; one column when printed.',
      },
      ats: null,
    },
    {
      id: 'lista',
      label: { es: 'Lista', en: 'List' },
      description: {
        es: 'Una sola columna sin tarjetas, con una línea guía junto a cada entrada: se lee como un documento y aguanta descripciones largas. Muestra menos a la vez en pantallas anchas.',
        en: 'One column without cards and a guide line beside each entry: it reads like a document and handles long descriptions. Shows less at once on wide screens.',
      },
      ats: null,
    },
  ],
  presentation: [
    {
      id: 'base',
      label: { es: 'Clara', en: 'Light' },
      description: {
        es: 'Fondo claro y texto oscuro, centrada en el título. Funciona en cualquier pantalla.',
        en: 'Light background and dark text, centred on the title. Works on any screen.',
      },
      ats: null,
    },
    {
      id: 'contraste',
      label: { es: 'Alto contraste', en: 'High contrast' },
      description: {
        es: 'Fondo oscuro, texto claro y títulos más grandes alineados a la izquierda, para proyectar en salas iluminadas. Al imprimir vuelve a fondo blanco para ahorrar tinta.',
        en: 'Dark background, light text and larger left-aligned titles, for projecting in lit rooms. Printing switches back to white to save ink.',
      },
      ats: null,
    },
  ],
  cover_letter: [
    {
      id: 'base',
      label: { es: 'Básica', en: 'Basic' },
      description: {
        es: 'Carta sencilla con la letra del sistema y tu nombre como encabezado.',
        en: 'A plain letter in system fonts with your name as the heading.',
      },
      ats: ATS_FIRST,
    },
    {
      id: 'formal',
      label: { es: 'Formal', en: 'Formal' },
      description: {
        es: 'Formato de carta tradicional: letra con remates (serif), remitente discreto arriba y márgenes amplios. No agrega fecha ni destinatario: sólo lo que escribiste.',
        en: 'A traditional letter format: serif type, a discreet sender block and wide margins. It adds no date or recipient: only what you wrote.',
      },
      ats: ATS_SAFE,
    },
  ],
};

/** The template ids a kind offers, `base` first. Unknown kinds offer nothing. */
export function templateIds(kind: string): string[] {
  return (TEMPLATE_REGISTRY[kind as ArtifactKind] ?? []).map((t) => t.id);
}

/** True when `id` is one of `kind`'s templates (the API allowlist). */
export function isTemplateFor(kind: string, id: string): boolean {
  return templateIds(kind).includes(id);
}

/** The registry entry, or null for an id the kind does not offer (a stored row from before the allowlist). */
export function templateInfo(kind: string, id: string): TemplateInfo | null {
  return (TEMPLATE_REGISTRY[kind as ArtifactKind] ?? []).find((t) => t.id === id) ?? null;
}
