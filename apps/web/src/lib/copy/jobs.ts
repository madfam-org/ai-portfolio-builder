/**
 * Strings of the jobs pipeline, the job page and the tailoring workspace (`/empleos/...`). Owner: W3-3. es-MX is the
 * source; en mirrors it. Job status and artifact kind labels live in copy/app.ts (shared).
 *
 * Truth rules (R85, lane X §5/§6): the match is a keyword overlap and is always called that, never AI, never a
 * prediction; no percentage the API does not return; the posting link is a reference the app never visits; AI
 * suggestions are «próximamente» and nothing more.
 */
import type { ArtifactKind, ItemKind } from './app.ts';
import type { Locale } from '../routing.ts';

/** `{name}` placeholders → values. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

export interface JobsCopy {
  intro: string;
  /** The match is a keyword overlap, never called AI (lane X §5, PR W3-3). */
  matchLabel: string;
  loading: string;
  intake: {
    heading: string;
    title: string;
    company: string;
    location: string;
    sourceUrl: string;
    sourceUrlHint: string;
    sourceText: string;
    sourceTextHint: string;
    counter: string;
    notes: string;
    submit: string;
    saving: string;
    created: string;
  };
  fieldErrors: { required: string; tooLong: string; url: string };
  board: {
    heading: string;
    empty: string;
    emptyBody: string;
    columnEmpty: string;
    showArchived: string;
    statusLabel: string;
    move: string;
    moved: string;
    open: string;
    tailor: string;
    at: string;
  };
  detail: {
    back: string;
    sourceLink: string;
    sourceNote: string;
    noSource: string;
    posting: string;
    postingToggle: string;
    statusHeading: string;
    notes: string;
    notesSave: string;
    edit: string;
    editHeading: string;
    save: string;
    cancel: string;
    delete: string;
    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    deleteBlocked: string;
    deleted: string;
    notFound: string;
  };
  match: {
    explain: string;
    normalised: string;
    coverage: string;
    ranked: string;
    point: string;
    points: string;
    matchedTags: string;
    matchedTerms: string;
    unmatched: string;
    missing: string;
    missingHint: string;
    missingNone: string;
    noItems: string;
    noItemsAction: string;
  };
  docs: { heading: string; none: string; version: string; tailorCta: string; viewAll: string };
  tailor: {
    intro: string;
    preselected: string;
    selected: string;
    selectedEmpty: string;
    available: string;
    availableEmpty: string;
    add: string;
    remove: string;
    up: string;
    down: string;
    position: string;
    adjust: string;
    adjusted: string;
    overrideTitle: string;
    overrideSummary: string;
    overrideHighlights: string;
    overrideHint: string;
    options: string;
    kindsLegend: string;
    template: string;
    templates: Record<string, string>;
    language: string;
    languages: Record<'es-MX' | 'en', string>;
    summary: string;
    summaryHint: string;
    showContact: string;
    showContactHint: string;
    greeting: string;
    closing: string;
    willCreate: string;
    create: string;
    creating: string;
    created: string;
    createdNext: string;
    foreignItems: string;
    problems: { kindsRequired: string; itemsRequired: string; itemsTooMany: string; tooLong: string; tooManyHighlights: string };
    aiHeading: string;
    aiBody: string;
  };
  /** One item (singular), for the kind badge next to an item. */
  itemKind: Record<ItemKind, string>;
  /** Plural kind names for the success links («Abrir CV»). */
  openKind: Record<ArtifactKind, string>;
}

export const JOBS_COPY: Record<Locale, JobsCopy> = {
  es: {
    intro: 'Las vacantes a las que te postulas, una por una.',
    matchLabel: 'Coincidencia por palabras clave (sin IA)',
    loading: 'Cargando…',
    intake: {
      heading: 'Agregar un empleo',
      title: 'Puesto',
      company: 'Empresa (opcional)',
      location: 'Ubicación (opcional)',
      sourceUrl: 'Enlace al anuncio (opcional)',
      sourceUrlHint: 'Solo guardamos el enlace; no lo visitamos.',
      sourceText: 'Texto del anuncio',
      sourceTextHint: 'Copia y pega el texto completo de la vacante (máximo {max} caracteres).',
      counter: '{n} de {max} caracteres',
      notes: 'Notas (opcional)',
      submit: 'Guardar empleo',
      saving: 'Guardando…',
      created: 'Empleo guardado',
    },
    fieldErrors: {
      required: 'Este campo es obligatorio.',
      tooLong: 'Es demasiado largo (máximo {max} caracteres).',
      url: 'Escribe un enlace que empiece con https:// o http://.',
    },
    board: {
      heading: 'Tus postulaciones',
      empty: 'Aún no guardas ningún empleo.',
      emptyBody: 'Pega el texto de una vacante en el formulario para empezar.',
      columnEmpty: 'Ninguno.',
      showArchived: 'Mostrar archivados ({n})',
      statusLabel: 'Estado de «{title}»',
      move: 'Mover',
      moved: '«{title}» pasó a «{status}».',
      open: 'Abrir',
      tailor: 'Adaptar documentos',
      at: 'en',
    },
    detail: {
      back: 'Volver a empleos',
      sourceLink: 'Anuncio original en {host}',
      sourceNote: 'Solo guardamos el enlace; no lo visitamos.',
      noSource: 'Sin enlace al anuncio.',
      posting: 'Texto del anuncio',
      postingToggle: 'Mostrar el texto completo ({n} caracteres)',
      statusHeading: 'Estado',
      notes: 'Notas',
      notesSave: 'Guardar notas',
      edit: 'Editar datos del empleo',
      editHeading: 'Editar datos del empleo',
      save: 'Guardar cambios',
      cancel: 'Cancelar',
      delete: 'Eliminar empleo',
      deleteTitle: '¿Eliminar este empleo?',
      deleteBody: 'Se borran la vacante y tus notas. No se puede deshacer.',
      deleteConfirm: 'Eliminar',
      deleteBlocked: 'Este empleo tiene documentos. Elimínalos primero en Documentos; nunca los borramos por ti.',
      deleted: 'Empleo eliminado',
      notFound: 'No encontramos este empleo. Puede que no exista o que pertenezca a otra cuenta.',
    },
    match: {
      explain:
        'Comparamos las palabras del anuncio con las etiquetas y el texto de cada elemento de tu perfil. Una etiqueta que aparece completa en el anuncio suma 3 puntos; cada otra palabra que coincide suma 1. Es una regla fija y transparente ({algorithm}), no una evaluación de tu candidatura ni una predicción.',
      normalised: 'Las palabras se comparan en minúsculas, sin acentos y sin la «s» final del plural; por eso algunas se ven recortadas.',
      coverage: 'El anuncio tiene {jobTerms} términos distintos; tu perfil cubre {coveredTerms}.',
      ranked: 'Tus elementos, de mayor a menor coincidencia',
      point: '{n} punto',
      points: '{n} puntos',
      matchedTags: 'Etiquetas que aparecen en el anuncio:',
      matchedTerms: 'Palabras que coinciden:',
      unmatched: 'Elementos sin coincidencias ({n})',
      missing: 'Términos del anuncio que tu perfil aún no cubre',
      missingHint: 'Los más frecuentes primero. Si alguno describe algo que sí sabes hacer, agrégalo a tu perfil.',
      missingNone: 'Tu perfil cubre todos los términos del anuncio.',
      noItems: 'Tu perfil aún no tiene elementos para comparar con este anuncio.',
      noItemsAction: 'Ir a mi perfil',
    },
    docs: {
      heading: 'Documentos para este empleo',
      none: 'Aún no hay documentos para este empleo.',
      version: 'versión {n}',
      tailorCta: 'Adaptar documentos para este empleo',
      viewAll: 'Ver todos en Documentos',
    },
    tailor: {
      intro: 'Elige qué parte de tu perfil va en los documentos de este empleo. Lo que ajustes aquí solo aplica a este empleo: tu perfil no cambia.',
      preselected: 'Preseleccionamos los elementos con coincidencia por palabras clave. Agrega, quita u ordena como quieras.',
      selected: 'En los documentos de este empleo ({n})',
      selectedEmpty: 'Aún no eliges nada. Agrega elementos de la lista de abajo.',
      available: 'Disponibles en tu perfil ({n})',
      availableEmpty: 'Ya elegiste todos los elementos de tu perfil.',
      add: 'Agregar',
      remove: 'Quitar',
      up: 'Subir',
      down: 'Bajar',
      position: '{n} de {total}',
      adjust: 'Ajustar el texto para este empleo',
      adjusted: 'Texto ajustado',
      overrideTitle: 'Título para este empleo',
      overrideSummary: 'Descripción para este empleo',
      overrideHighlights: 'Puntos clave para este empleo (uno por línea)',
      overrideHint: 'Si lo dejas vacío, se usa el texto de tu perfil. Tu perfil no cambia.',
      options: 'Qué documentos crear',
      kindsLegend: 'Documentos',
      template: 'Plantilla',
      templates: { base: 'Base (la única por ahora)' },
      language: 'Idioma de los documentos',
      languages: { 'es-MX': 'Español (México)', en: 'English' },
      summary: 'Resumen para este empleo (opcional)',
      summaryHint: 'Encabeza los documentos. Si lo dejas vacío, se usa el resumen de tu perfil.',
      showContact: 'Incluir mis datos de contacto',
      showContactHint: 'Correo, teléfono y enlaces de tu perfil.',
      greeting: 'Saludo de la carta (opcional)',
      closing: 'Despedida de la carta (opcional)',
      willCreate: 'Se crearán estos borradores:',
      create: 'Crear documentos para este empleo',
      creating: 'Creando…',
      created: 'Listo: se crearon {n} borradores para este empleo.',
      createdNext: 'Ábrelos en Documentos para revisarlos.',
      foreignItems: 'Algunos elementos ya no están en tu perfil. Recarga la página y vuelve a elegir.',
      problems: {
        kindsRequired: 'Elige al menos un documento.',
        itemsRequired: 'Elige al menos un elemento de tu perfil.',
        itemsTooMany: 'Elige como máximo {max} elementos.',
        tooLong: 'Es demasiado largo (máximo {max} caracteres).',
        tooManyHighlights: 'Escribe como máximo {max} puntos clave de {length} caracteres cada uno.',
      },
      aiHeading: 'Sugerencias con IA (próximamente)',
      aiBody: 'Más adelante podrás pedir propuestas de redacción para este empleo; nunca se aplicarán sin que las aceptes. Hoy esta pantalla no usa IA.',
    },
    itemKind: {
      experience: 'Experiencia',
      education: 'Educación',
      skill: 'Habilidad',
      project: 'Proyecto',
      certification: 'Certificación',
      achievement: 'Logro',
      language: 'Idioma',
      publication: 'Publicación',
      volunteering: 'Voluntariado',
      award: 'Reconocimiento',
      link: 'Enlace',
    },
    openKind: { cv: 'Abrir el CV', portfolio: 'Abrir el portafolio', presentation: 'Abrir la presentación', cover_letter: 'Abrir la carta' },
  },
  en: {
    intro: 'The jobs you apply to, one by one.',
    matchLabel: 'Keyword match (no AI)',
    loading: 'Loading…',
    intake: {
      heading: 'Add a job',
      title: 'Job title',
      company: 'Company (optional)',
      location: 'Location (optional)',
      sourceUrl: 'Link to the posting (optional)',
      sourceUrlHint: 'We only store the link; we never visit it.',
      sourceText: 'Posting text',
      sourceTextHint: 'Copy and paste the full text of the posting (at most {max} characters).',
      counter: '{n} of {max} characters',
      notes: 'Notes (optional)',
      submit: 'Save job',
      saving: 'Saving…',
      created: 'Job saved',
    },
    fieldErrors: {
      required: 'This field is required.',
      tooLong: 'It is too long (at most {max} characters).',
      url: 'Enter a link that starts with https:// or http://.',
    },
    board: {
      heading: 'Your applications',
      empty: 'You have not saved any job yet.',
      emptyBody: 'Paste the text of a posting into the form to start.',
      columnEmpty: 'None.',
      showArchived: 'Show archived ({n})',
      statusLabel: 'Status of “{title}”',
      move: 'Move',
      moved: '“{title}” moved to “{status}”.',
      open: 'Open',
      tailor: 'Tailor documents',
      at: 'at',
    },
    detail: {
      back: 'Back to jobs',
      sourceLink: 'Original posting on {host}',
      sourceNote: 'We only store the link; we never visit it.',
      noSource: 'No link to the posting.',
      posting: 'Posting text',
      postingToggle: 'Show the full text ({n} characters)',
      statusHeading: 'Status',
      notes: 'Notes',
      notesSave: 'Save notes',
      edit: 'Edit job details',
      editHeading: 'Edit job details',
      save: 'Save changes',
      cancel: 'Cancel',
      delete: 'Delete job',
      deleteTitle: 'Delete this job?',
      deleteBody: 'The posting and your notes are deleted. This cannot be undone.',
      deleteConfirm: 'Delete',
      deleteBlocked: 'This job has documents. Delete them first in Documents; we never delete them for you.',
      deleted: 'Job deleted',
      notFound: 'We could not find this job. It may not exist or it may belong to another account.',
    },
    match: {
      explain:
        'We compare the words of the posting with the tags and the text of each item of your profile. A tag that appears in full in the posting adds 3 points; every other matching word adds 1. It is a fixed, transparent rule ({algorithm}), not an assessment of your application and not a prediction.',
      normalised: 'Words are compared in lower case, without accents and without a final plural «s»; that is why some look cut short.',
      coverage: 'The posting has {jobTerms} distinct terms; your profile covers {coveredTerms}.',
      ranked: 'Your items, from most to least matching',
      point: '{n} point',
      points: '{n} points',
      matchedTags: 'Tags that appear in the posting:',
      matchedTerms: 'Matching words:',
      unmatched: 'Items with no match ({n})',
      missing: 'Terms in the posting your profile does not cover yet',
      missingHint: 'Most frequent first. If one describes something you can do, add it to your profile.',
      missingNone: 'Your profile covers every term of the posting.',
      noItems: 'Your profile has no items to compare with this posting yet.',
      noItemsAction: 'Go to my profile',
    },
    docs: {
      heading: 'Documents for this job',
      none: 'There are no documents for this job yet.',
      version: 'version {n}',
      tailorCta: 'Tailor documents for this job',
      viewAll: 'See all in Documents',
    },
    tailor: {
      intro: 'Choose which parts of your profile go into the documents for this job. What you adjust here applies to this job only: your profile does not change.',
      preselected: 'We preselected the items with a keyword match. Add, remove or reorder as you like.',
      selected: 'In the documents for this job ({n})',
      selectedEmpty: 'Nothing chosen yet. Add items from the list below.',
      available: 'Available in your profile ({n})',
      availableEmpty: 'You chose every item of your profile.',
      add: 'Add',
      remove: 'Remove',
      up: 'Move up',
      down: 'Move down',
      position: '{n} of {total}',
      adjust: 'Adjust the text for this job',
      adjusted: 'Text adjusted',
      overrideTitle: 'Title for this job',
      overrideSummary: 'Description for this job',
      overrideHighlights: 'Key points for this job (one per line)',
      overrideHint: 'Leave it empty to use the text of your profile. Your profile does not change.',
      options: 'Which documents to create',
      kindsLegend: 'Documents',
      template: 'Template',
      templates: { base: 'Base (the only one for now)' },
      language: 'Language of the documents',
      languages: { 'es-MX': 'Español (México)', en: 'English' },
      summary: 'Summary for this job (optional)',
      summaryHint: 'It heads the documents. Leave it empty to use the summary of your profile.',
      showContact: 'Include my contact details',
      showContactHint: 'Email, phone and links from your profile.',
      greeting: 'Greeting of the letter (optional)',
      closing: 'Closing of the letter (optional)',
      willCreate: 'These drafts will be created:',
      create: 'Create documents for this job',
      creating: 'Creating…',
      created: 'Done: {n} drafts were created for this job.',
      createdNext: 'Open them in Documents to review them.',
      foreignItems: 'Some items are no longer in your profile. Reload the page and choose again.',
      problems: {
        kindsRequired: 'Choose at least one document.',
        itemsRequired: 'Choose at least one item of your profile.',
        itemsTooMany: 'Choose at most {max} items.',
        tooLong: 'It is too long (at most {max} characters).',
        tooManyHighlights: 'Write at most {max} key points of {length} characters each.',
      },
      aiHeading: 'AI suggestions (coming soon)',
      aiBody: 'Later you will be able to ask for wording proposals for this job; they will never be applied unless you accept them. This screen uses no AI today.',
    },
    itemKind: {
      experience: 'Experience',
      education: 'Education',
      skill: 'Skill',
      project: 'Project',
      certification: 'Certification',
      achievement: 'Achievement',
      language: 'Language',
      publication: 'Publication',
      volunteering: 'Volunteering',
      award: 'Award',
      link: 'Link',
    },
    openKind: { cv: 'Open the CV', portfolio: 'Open the portfolio', presentation: 'Open the presentation', cover_letter: 'Open the letter' },
  },
};
