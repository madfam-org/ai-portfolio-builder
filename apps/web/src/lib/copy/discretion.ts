/**
 * W7 (B3): «Búsqueda confidencial», the reminder the publish dialog (`/documentos/:id`) shows BEFORE a document becomes
 * link-shared or public. Many people look for work while employed: who can see the document, that a link can be
 * forwarded, that indexing stays off unless they tick it, and that the document's title does NOT travel with the page:
 * the tab and a shared link's preview show the person and the kind of document, so a title naming the company applied
 * to stays private (components/render/model.ts `heading`, app/h/pages/load.ts `pageTitle`). es-MX source, en.
 */
import type { Locale } from '../routing.ts';

export interface DiscretionCopy {
  title: string;
  link: string;
  public: string;
  /** The current title is quoted, with the assurance that only its owner sees it. */
  titleNote: (title: string) => string;
}

export const DISCRETION_COPY: Record<Locale, DiscretionCopy> = {
  es: {
    title: 'Búsqueda confidencial',
    link: 'Cualquier persona con el enlace podrá ver este documento, también si alguien se lo reenvía. Si tu búsqueda es confidencial, compártelo solo con quien recluta y despublícalo al terminar.',
    public: 'Cualquier persona con la dirección podrá ver esta página, y los buscadores podrán encontrarla si marcas la casilla de indexación (queda desactivada si no la marcas). Si tu búsqueda es confidencial, prefiere «Con enlace».',
    titleNote: (title) => `El título «${title}» es solo para ti: no aparece en la página que compartes. Ahí se ven tu nombre y el tipo de documento.`,
  },
  en: {
    title: 'Confidential job search',
    link: 'Anyone with the link will be able to see this document, including anyone it is forwarded to. If your search is confidential, share it only with the recruiter and unpublish it when you are done.',
    public: 'Anyone with the address will be able to see this page, and search engines can find it if you tick the indexing box (it stays off unless you tick it). If your search is confidential, prefer “Link”.',
    titleNote: (title) => `The title “${title}” is only for you: it does not appear on the page you share. That page shows your name and the kind of document.`,
  },
};
