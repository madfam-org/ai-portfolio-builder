/**
 * Strings of the artifact renderers (cv, portfolio, presentation, cover letter; shared by the cv-app preview, the
 * print view and the pages host) and of the documents surface of the app (`/documentos/*`: list, detail, preview,
 * print, publish). es-MX source, en. Owner: W3-4.
 *
 * Truth rules (R85): the renderers print only what the person entered; these strings are labels, never content.
 * Level words replace the legacy percentage bars (lane X §1.3).
 */
import type { Locale } from '../routing.ts';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship' | 'volunteer' | 'other';

export interface RenderCopy {
  /** `Intl` locale of dates printed in a document of this language. */
  intl: string;
  present: string;
  contact: string;
  summary: string;
  skillLevels: Record<SkillLevel, string>;
  /** CEFR codes stay as they are; only «native» is a word. */
  native: string;
  employmentTypes: Record<EmploymentType, string>;
  years: (n: number) => string;
  expires: string;
  credential: string;
  relevant: string;
  deckLabel: string;
  previous: string;
  next: string;
  /** «Diapositiva {n} de {total}». */
  position: string;
  keyboardHint: string;
}

export const RENDER_COPY: Record<Locale, RenderCopy> = {
  es: {
    intl: 'es-MX',
    present: 'Actualidad',
    contact: 'Contacto',
    summary: 'Perfil profesional',
    skillLevels: { beginner: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto' },
    native: 'Nativo',
    employmentTypes: {
      full_time: 'Tiempo completo',
      part_time: 'Medio tiempo',
      contract: 'Por contrato',
      freelance: 'Independiente',
      internship: 'Prácticas',
      volunteer: 'Voluntariado',
      other: 'Otro',
    },
    years: (n) => (n === 1 ? '1 año' : `${n} años`),
    expires: 'Vence',
    credential: 'Folio',
    relevant: 'Experiencia relevante',
    deckLabel: 'Presentación',
    previous: 'Anterior',
    next: 'Siguiente',
    position: 'Diapositiva {n} de {total}',
    keyboardHint: 'Usa las flechas ← y →, la barra espaciadora, Inicio o Fin para moverte entre diapositivas.',
  },
  en: {
    intl: 'en-US',
    present: 'Present',
    contact: 'Contact',
    summary: 'Summary',
    skillLevels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' },
    native: 'Native',
    employmentTypes: {
      full_time: 'Full-time',
      part_time: 'Part-time',
      contract: 'Contract',
      freelance: 'Freelance',
      internship: 'Internship',
      volunteer: 'Volunteer',
      other: 'Other',
    },
    years: (n) => (n === 1 ? '1 year' : `${n} years`),
    expires: 'Expires',
    credential: 'Credential ID',
    relevant: 'Relevant experience',
    deckLabel: 'Presentation',
    previous: 'Previous',
    next: 'Next',
    position: 'Slide {n} of {total}',
    keyboardHint: 'Use the ← and → arrows, the space bar, Home or End to move between slides.',
  },
};

export type Visibility = 'private' | 'link' | 'public';
export type Paper = 'letter' | 'a4';

/** The documents surface of the app (cv-app `/documentos/*`). */
export interface DocumentsCopy {
  listIntro: string;
  filterJob: string;
  filterKind: string;
  filterStatus: string;
  all: string;
  general: string;
  noMatch: string;
  clearFilters: string;
  visibility: Record<Visibility, string>;
  suspended: string;
  open: string;
  preview: string;
  print: string;
  forJob: string;
  jobLabel: string;
  jobNone: string;
  back: string;
  settingsTitle: string;
  localeLabel: string;
  locales: Record<'es-MX' | 'en', string>;
  templateLabel: string;
  templateHint: string;
  templates: Record<string, string>;
  statusLabel: string;
  statusPublishedHint: string;
  save: string;
  contentTitle: string;
  contentSummary: (items: number, blocks: number) => string;
  contentWhereJob: string;
  contentWhereProfile: string;
  suspendedTitle: string;
  suspendedBody: string;
  suspendedReason: string;
  publishTitle: string;
  publishIntro: string;
  publishOffline: string;
  whoLabel: string;
  choicePrivate: string;
  choicePrivateHint: string;
  choiceLink: string;
  choiceLinkHint: string;
  choicePublic: string;
  choicePublicHint: string;
  slugLabel: string;
  slugHint: string;
  slugInvalid: string;
  slugTaken: string;
  indexLabel: string;
  indexHint: string;
  publish: string;
  update: string;
  published: string;
  unpublished: string;
  shareUrl: string;
  copy: string;
  copied: string;
  copyFailed: string;
  rotate: string;
  rotateTitle: string;
  rotateBody: string;
  unpublish: string;
  unpublishTitle: string;
  unpublishBody: string;
  cancel: string;
  limitHint: string;
  limitReached: string;
  suspendedConflict: string;
  previewNote: string;
  previewPrivate: string;
  printTitle: string;
  printHowTo: string;
  printHowToSlides: string;
  paperLabel: string;
  papers: Record<Paper, string>;
  printButton: string;
  refreshing: string;
  refreshFailed: string;
}

export const DOCUMENTS_COPY: Record<Locale, DocumentsCopy> = {
  es: {
    listIntro: 'Tus CV, portafolios, presentaciones y cartas: generales o adaptados a un empleo. Solo tú los ves hasta que decidas compartirlos.',
    filterJob: 'Filtrar por empleo',
    filterKind: 'Filtrar por tipo',
    filterStatus: 'Filtrar por estado',
    all: 'Todos',
    general: 'Generales (sin empleo)',
    noMatch: 'Ningún documento coincide con estos filtros.',
    clearFilters: 'Quitar filtros',
    visibility: { private: 'Privado', link: 'Con enlace', public: 'Público' },
    suspended: 'Suspendido',
    open: 'Abrir',
    preview: 'Vista previa',
    print: 'Imprimir o guardar PDF',
    forJob: 'Para el empleo',
    jobLabel: 'Empleo (opcional)',
    jobNone: 'Ninguno: documento general',
    back: 'Volver al documento',
    settingsTitle: 'Datos del documento',
    localeLabel: 'Idioma del documento',
    locales: { 'es-MX': 'Español (México)', en: 'Inglés' },
    templateLabel: 'Plantilla',
    templateHint: 'Por ahora hay una plantilla por tipo de documento; los sistemas de reclutamiento (ATS) leen su texto sin problema.',
    templates: { base: 'Básica (compatible con ATS)' },
    statusLabel: 'Estado',
    statusPublishedHint: 'Está publicado. Para volverlo borrador o listo, primero despublícalo.',
    save: 'Guardar cambios',
    contentTitle: 'Contenido',
    contentSummary: (items, blocks) =>
      `${items === 1 ? '1 elemento de tu perfil' : `${items} elementos de tu perfil`} y ${blocks === 1 ? '1 bloque de texto' : `${blocks} bloques de texto`}.`,
    contentWhereJob: 'Elige y ordena qué incluir en «Adaptar al empleo».',
    contentWhereProfile: 'Lo que aparece sale de tu perfil; edítalo ahí.',
    suspendedTitle: 'Documento suspendido',
    suspendedBody: 'Este documento se retiró por una revisión de contenido y no se puede compartir ni publicar. Si crees que es un error, escribe a legal@madfam.io.',
    suspendedReason: 'Motivo',
    publishTitle: 'Compartir',
    publishIntro: 'Decide quién puede ver este documento. Puedes cambiarlo o retirarlo cuando quieras.',
    publishOffline: 'Compartir todavía no está disponible: el sitio de páginas públicas aún no está en línea. Tu documento sigue privado.',
    whoLabel: 'Quién puede verlo',
    choicePrivate: 'Privado',
    choicePrivateHint: 'Solo tú lo ves, aquí en la app.',
    choiceLink: 'Con enlace',
    choiceLinkHint: 'Cualquiera con el enlace puede verlo. No aparece en buscadores.',
    choicePublic: 'Público',
    choicePublicHint: 'Con una dirección que tú eliges. Los buscadores no la indexan a menos que lo permitas.',
    slugLabel: 'Dirección',
    slugHint: 'De 3 a 64 caracteres: minúsculas, números y guiones (no al inicio ni al final). Algunas palabras están reservadas.',
    slugInvalid: 'Esa dirección no es válida o está reservada.',
    slugTaken: 'Esa dirección ya está en uso. Prueba otra.',
    indexLabel: 'Permitir que buscadores indexen esta página',
    indexHint: 'Desactivado: la página dice a los buscadores que no la muestren.',
    publish: 'Publicar',
    update: 'Guardar cambios',
    published: 'Publicado',
    unpublished: 'Ya no está publicado',
    shareUrl: 'Dirección para compartir',
    copy: 'Copiar enlace',
    copied: 'Enlace copiado',
    copyFailed: 'No se pudo copiar. Selecciona la dirección y cópiala a mano.',
    rotate: 'Cambiar enlace',
    rotateTitle: '¿Cambiar el enlace?',
    rotateBody: 'El enlace actual dejará de funcionar y tendrás uno nuevo para compartir.',
    unpublish: 'Despublicar',
    unpublishTitle: '¿Despublicar este documento?',
    unpublishBody: 'La dirección dejará de funcionar de inmediato. El documento queda guardado y privado.',
    cancel: 'Cancelar',
    limitHint: 'Puedes publicar hasta 20 documentos distintos cada 24 horas.',
    limitReached: 'Llegaste al límite de 20 documentos publicados en 24 horas. Podrás publicar este cuando se cumplan 24 horas de una publicación anterior.',
    suspendedConflict: 'Este documento está suspendido y no se puede publicar.',
    previewNote: 'Así lo verá quien lo abra.',
    previewPrivate: 'Ahora es privado: solo tú puedes verlo.',
    printTitle: 'Imprimir o guardar como PDF',
    printHowTo:
      'Elige el tamaño de papel y pulsa «Imprimir o guardar como PDF». En la ventana de tu navegador, como destino elige «Guardar como PDF»: el texto queda seleccionable, como lo leen los sistemas de reclutamiento.',
    printHowToSlides: 'Pulsa «Imprimir o guardar como PDF» y elige «Guardar como PDF» como destino: cada diapositiva sale en su propia página.',
    paperLabel: 'Tamaño de papel',
    papers: { letter: 'Carta (México y EE. UU.)', a4: 'A4' },
    printButton: 'Imprimir o guardar como PDF',
    refreshing: 'Renovando tu sesión…',
    refreshFailed: 'Tu sesión terminó. Inicia sesión de nuevo para ver tus documentos.',
  },
  en: {
    listIntro: 'Your CVs, portfolios, presentations and letters: general or tailored to a job. Only you see them until you decide to share them.',
    filterJob: 'Filter by job',
    filterKind: 'Filter by type',
    filterStatus: 'Filter by status',
    all: 'All',
    general: 'General (no job)',
    noMatch: 'No document matches these filters.',
    clearFilters: 'Clear filters',
    visibility: { private: 'Private', link: 'Link', public: 'Public' },
    suspended: 'Suspended',
    open: 'Open',
    preview: 'Preview',
    print: 'Print or save PDF',
    forJob: 'For the job',
    jobLabel: 'Job (optional)',
    jobNone: 'None: a general document',
    back: 'Back to the document',
    settingsTitle: 'Document details',
    localeLabel: 'Document language',
    locales: { 'es-MX': 'Spanish (Mexico)', en: 'English' },
    templateLabel: 'Template',
    templateHint: 'For now there is one template per document type.',
    templates: { base: 'Basic (ATS-friendly)' },
    statusLabel: 'Status',
    statusPublishedHint: 'It is published. To make it a draft or ready again, unpublish it first.',
    save: 'Save changes',
    contentTitle: 'Content',
    contentSummary: (items, blocks) => `${items === 1 ? '1 item from your profile' : `${items} items from your profile`} and ${blocks === 1 ? '1 text block' : `${blocks} text blocks`}.`,
    contentWhereJob: 'Choose and order what to include in «Tailor to the job».',
    contentWhereProfile: 'What appears comes from your profile; edit it there.',
    suspendedTitle: 'Document suspended',
    suspendedBody: 'This document was withdrawn after a content review and cannot be shared or published. If you think this is a mistake, write to legal@madfam.io.',
    suspendedReason: 'Reason',
    publishTitle: 'Share',
    publishIntro: 'Decide who can see this document. You can change or withdraw it at any time.',
    publishOffline: 'Sharing is not available yet: the public pages site is not online yet. Your document stays private.',
    whoLabel: 'Who can see it',
    choicePrivate: 'Private',
    choicePrivateHint: 'Only you see it, here in the app.',
    choiceLink: 'Link',
    choiceLinkHint: 'Anyone with the link can see it. It does not appear in search engines.',
    choicePublic: 'Public',
    choicePublicHint: 'At an address you choose. Search engines do not index it unless you allow it.',
    slugLabel: 'Address',
    slugHint: '3 to 64 characters: lowercase letters, digits and hyphens (not at the start or end). Some words are reserved.',
    slugInvalid: 'That address is not valid or is reserved.',
    slugTaken: 'That address is already in use. Try another one.',
    indexLabel: 'Allow search engines to index this page',
    indexHint: 'Off: the page tells search engines not to show it.',
    publish: 'Publish',
    update: 'Save changes',
    published: 'Published',
    unpublished: 'No longer published',
    shareUrl: 'Address to share',
    copy: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'It could not be copied. Select the address and copy it by hand.',
    rotate: 'Change link',
    rotateTitle: 'Change the link?',
    rotateBody: 'The current link will stop working and you will get a new one to share.',
    unpublish: 'Unpublish',
    unpublishTitle: 'Unpublish this document?',
    unpublishBody: 'The address stops working at once. The document stays saved and private.',
    cancel: 'Cancel',
    limitHint: 'You can publish up to 20 different documents every 24 hours.',
    limitReached: 'You reached the limit of 20 documents published in 24 hours. You can publish this one once 24 hours have passed since an earlier publication.',
    suspendedConflict: 'This document is suspended and cannot be published.',
    previewNote: 'This is how people who open it will see it.',
    previewPrivate: 'It is private now: only you can see it.',
    printTitle: 'Print or save as PDF',
    printHowTo:
      'Choose the paper size and press «Print or save as PDF». In your browser’s window, choose «Save as PDF» as the destination: the text stays selectable, the way applicant tracking systems read it.',
    printHowToSlides: 'Press «Print or save as PDF» and choose «Save as PDF» as the destination: each slide gets its own page.',
    paperLabel: 'Paper size',
    papers: { letter: 'Letter (Mexico and US)', a4: 'A4' },
    printButton: 'Print or save as PDF',
    refreshing: 'Renewing your session…',
    refreshFailed: 'Your session ended. Sign in again to see your documents.',
  },
};

/** «Diapositiva {n} de {total}». */
export function slidePosition(locale: Locale, n: number, total: number): string {
  return RENDER_COPY[locale].position.replace('{n}', String(n)).replace('{total}', String(total));
}
