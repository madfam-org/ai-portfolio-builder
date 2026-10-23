/**
 * Strings of the core-profile editor (`/perfil`). Owner: W3-2. Item kind section titles live in copy/app.ts
 * (`itemKinds`, shared with the renderers and the tailoring workspace); everything else the editor says is here.
 * Truth rules (R85, R32/R36): no AI promise, never scraping. The import's own strings live in copy/import.ts (W4-I).
 */
import type { ItemKind } from './app.ts';
import type { Locale } from '../routing.ts';

type Fields = Record<string, string>;

export interface ProfileCopy {
  intro: string;
  loading: string;
  /** Appended to the label of a required field. */
  requiredMark: string;
  /** The header (the person). */
  header: {
    title: string;
    intro: string;
    displayName: string;
    displayNameHint: string;
    displayNameFromAccount: string;
    headline: string;
    headlineHint: string;
    summary: string;
    summaryHint: string;
    locale: string;
    localeHint: string;
    locales: Record<'es-MX' | 'en', string>;
    contactTitle: string;
    contactIntro: string;
    email: string;
    phone: string;
    location: string;
    links: string;
    linksHint: string;
    save: string;
  };
  /** The «estado» line under the header form. */
  saveState: { clean: string; dirty: string; saving: string; saved: string; failed: string };
  links: { label: string; url: string; add: string; remove: string; row: string; empty: string };
  /** The whole profile is empty: why it matters. */
  empty: { title: string; body: string; points: string[] };
  itemsTitle: string;
  itemsIntro: string;
  contents: string;
  countLabel: (n: number) => string;
  /** Per kind: the add button, the empty line, the form heading when adding / editing, what to put in. */
  kinds: Record<ItemKind, { add: string; empty: string; newTitle: string; editTitle: string; hint: string }>;
  fields: Fields;
  /** Per-kind label overrides of `fields` (the same key means different things in different kinds). */
  fieldOverrides: Partial<Record<ItemKind, Fields>>;
  hints: { date: string; endDate: string; highlights: string; url: string; links: string; years: string };
  options: { none: string; employmentType: Fields; skillLevel: Fields; languageLevel: Fields };
  tags: { label: string; hint: string; add: string; remove: string; none: string; listLabel: string };
  actions: {
    edit: string;
    save: string;
    saveNew: string;
    cancel: string;
    delete: string;
    up: string;
    down: string;
    confirmTitle: string;
    confirmBody: string;
    confirm: string;
    pending: string;
    present: string;
  };
  announce: {
    created: string;
    updated: string;
    deleted: string;
    moved: (title: string, place: number, of: number) => string;
    rolledBack: string;
  };
  errors: {
    required: string;
    tooLong: (max: number) => string;
    url: string;
    date: string;
    email: string;
    choice: string;
    int: (min: number, max: number) => string;
    tooMany: (max: number) => string;
    lineTooLong: (max: number) => string;
    row: (row: number) => string;
    server: string;
    form: string;
  };
}

export const PROFILE_COPY: Record<Locale, ProfileCopy> = {
  es: {
    intro: 'Tu perfil central: lo capturas una vez y lo reutilizas en cada postulación.',
    loading: 'Cargando tu perfil…',
    requiredMark: '(obligatorio)',
    header: {
      title: 'Quién eres',
      intro: 'Esto encabeza cada CV, portafolio o presentación que prepares.',
      displayName: 'Nombre como quieres que aparezca',
      displayNameHint: 'Tal como debe leerse en tus documentos.',
      displayNameFromAccount: 'Lo tomamos de tu cuenta de Janua; puedes cambiarlo.',
      headline: 'Titular',
      headlineHint: 'Una línea: tu oficio o especialidad. Por ejemplo, «Ingeniera de datos».',
      summary: 'Resumen',
      summaryHint: 'Unas líneas sobre tu trayectoria. En cada documento podrás ajustarlo para la vacante.',
      locale: 'Idioma de tu perfil',
      localeHint: 'El idioma en el que escribes estos datos.',
      locales: { 'es-MX': 'Español (México)', en: 'Inglés' },
      contactTitle: 'Contacto',
      contactIntro: 'Solo aparece en un documento si tú eliges mostrarlo al prepararlo.',
      email: 'Correo electrónico',
      phone: 'Teléfono',
      location: 'Ciudad o región',
      links: 'Tus enlaces',
      linksHint:
        'Enlaces que te identifican y van en el encabezado: tu sitio, LinkedIn, GitHub. Para muestras de trabajo que quieras elegir por vacante, usa la sección «Enlaces» más abajo. Solo direcciones que empiezan con https:// o http://.',
      save: 'Guardar perfil',
    },
    saveState: { clean: 'Sin cambios pendientes.', dirty: 'Tienes cambios sin guardar.', saving: 'Guardando…', saved: 'Perfil guardado.', failed: 'No se guardó. Revisa los campos marcados.' },
    links: { label: 'Nombre', url: 'Dirección (URL)', add: 'Agregar enlace', remove: 'Quitar enlace', row: 'Enlace', empty: 'Sin enlaces.' },
    empty: {
      title: 'Tu perfil todavía está vacío',
      body: 'Cada CV, portafolio o presentación que prepares para una vacante se arma eligiendo elementos de este perfil. Entre más completo esté, más material tendrás para destacar lo que pide cada vacante:',
      points: [
        'Experiencia con logros concretos (qué hiciste y qué cambió), no solo el puesto.',
        'Proyectos con enlaces a lo que se puede ver o probar.',
        'Habilidades e idiomas con su nivel.',
        'Palabras clave en cada elemento: con ellas comparamos tu perfil con el texto de cada vacante.',
      ],
    },
    itemsTitle: 'Tu trayectoria',
    itemsIntro: 'Agrega cada elemento una vez. El orden que elijas aquí es el orden inicial en tus documentos.',
    contents: 'Secciones del perfil',
    countLabel: (n) => (n === 1 ? '1 elemento' : `${n} elementos`),
    kinds: {
      experience: { add: 'Agregar experiencia', empty: 'Aún no agregas experiencia laboral.', newTitle: 'Nueva experiencia', editTitle: 'Editar experiencia', hint: 'Empleos, proyectos por contrato, trabajo independiente o prácticas.' },
      education: { add: 'Agregar estudios', empty: 'Aún no agregas estudios.', newTitle: 'Nuevos estudios', editTitle: 'Editar estudios', hint: 'Carreras, posgrados, bachillerato técnico, diplomados.' },
      project: { add: 'Agregar proyecto', empty: 'Aún no agregas proyectos.', newTitle: 'Nuevo proyecto', editTitle: 'Editar proyecto', hint: 'Lo que construiste o en lo que participaste, con enlaces si se puede ver.' },
      skill: { add: 'Agregar habilidad', empty: 'Aún no agregas habilidades.', newTitle: 'Nueva habilidad', editTitle: 'Editar habilidad', hint: 'Una habilidad por elemento: herramientas, técnicas, conocimientos.' },
      language: { add: 'Agregar idioma', empty: 'Aún no agregas idiomas.', newTitle: 'Nuevo idioma', editTitle: 'Editar idioma', hint: 'Incluye tu lengua materna.' },
      certification: { add: 'Agregar certificación', empty: 'Aún no agregas certificaciones.', newTitle: 'Nueva certificación', editTitle: 'Editar certificación', hint: 'Con su vigencia, si vence: quien reclute la revisa.' },
      achievement: { add: 'Agregar logro', empty: 'Aún no agregas logros.', newTitle: 'Nuevo logro', editTitle: 'Editar logro', hint: 'Resultados que quieras poder destacar por separado.' },
      award: { add: 'Agregar reconocimiento', empty: 'Aún no agregas reconocimientos.', newTitle: 'Nuevo reconocimiento', editTitle: 'Editar reconocimiento', hint: 'Premios, becas, menciones.' },
      publication: { add: 'Agregar publicación', empty: 'Aún no agregas publicaciones.', newTitle: 'Nueva publicación', editTitle: 'Editar publicación', hint: 'Artículos, capítulos, ponencias, entradas de blog.' },
      volunteering: { add: 'Agregar voluntariado', empty: 'Aún no agregas voluntariado.', newTitle: 'Nuevo voluntariado', editTitle: 'Editar voluntariado', hint: 'Trabajo no remunerado en organizaciones o comunidades.' },
      link: { add: 'Agregar enlace', empty: 'Aún no agregas enlaces.', newTitle: 'Nuevo enlace', editTitle: 'Editar enlace', hint: 'Muestras de trabajo que quieras elegir para cada vacante (un video, un caso, un repositorio).' },
    },
    fields: {
      role: 'Puesto',
      organization: 'Empresa u organización',
      employmentType: 'Tipo de empleo',
      location: 'Ubicación',
      startDate: 'Inicio',
      endDate: 'Fin',
      current: 'Es mi trabajo actual',
      summary: 'Descripción',
      highlights: 'Logros y responsabilidades',
      institution: 'Institución',
      degree: 'Título o grado',
      field: 'Área de estudio',
      name: 'Nombre',
      level: 'Nivel',
      years: 'Años de experiencia',
      url: 'Enlace',
      links: 'Otros enlaces',
      issuer: 'Emitida por',
      date: 'Fecha',
      expiresOn: 'Vence',
      credentialId: 'Folio o ID de la credencial',
      title: 'Título',
      publisher: 'Editorial o medio',
      label: 'Nombre del enlace',
    },
    fieldOverrides: {
      education: { highlights: 'Logros destacados' },
      skill: { name: 'Habilidad' },
      project: { name: 'Nombre del proyecto', role: 'Tu papel en el proyecto', url: 'Enlace principal', links: 'Otros enlaces del proyecto' },
      certification: { name: 'Certificación', date: 'Fecha de emisión', url: 'Enlace para verificarla' },
      language: { code: 'Idioma', name: 'Nombre del idioma', level: 'Nivel (MCER)' },
      achievement: { title: 'Logro' },
      award: { title: 'Reconocimiento', issuer: 'Otorgado por' },
      publication: { date: 'Fecha de publicación' },
      volunteering: { role: 'Actividad o rol', organization: 'Organización' },
      link: { url: 'Dirección (URL)' },
    },
    hints: {
      date: 'AAAA, AAAA-MM o AAAA-MM-DD; por ejemplo, 2021-03.',
      endDate: 'AAAA, AAAA-MM o AAAA-MM-DD. Déjalo vacío si sigue en curso.',
      highlights: 'Uno por línea, hasta 30. Empieza con un verbo y, si puedes, con un resultado medible.',
      url: 'Dirección completa que empiece con https:// o http://.',
      links: 'Por ejemplo, el código fuente y una demostración. Solo https:// o http://.',
      years: 'Número entero, de 0 a 80.',
    },
    options: {
      none: 'Sin especificar',
      employmentType: { full_time: 'Tiempo completo', part_time: 'Medio tiempo', contract: 'Por contrato', freelance: 'Independiente', internship: 'Prácticas', volunteer: 'Voluntariado', other: 'Otro' },
      skillLevel: { beginner: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto' },
      languageLevel: { A1: 'A1 (inicial)', A2: 'A2 (básico)', B1: 'B1 (intermedio)', B2: 'B2 (intermedio alto)', C1: 'C1 (avanzado)', C2: 'C2 (dominio)', native: 'Lengua materna' },
    },
    tags: {
      label: 'Palabras clave',
      hint: 'Tecnologías, herramientas o temas de este elemento, separados por coma. Las usamos para compararlo con el texto de cada vacante (coincidencia por palabras clave, sin IA): una palabra clave que aparece en la vacante pesa más que el resto del texto. Hasta 50, de 60 caracteres cada una.',
      add: 'Agregar',
      remove: 'Quitar palabra clave',
      none: 'Sin palabras clave',
      listLabel: 'Palabras clave agregadas',
    },
    actions: {
      edit: 'Editar',
      save: 'Guardar cambios',
      saveNew: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      up: 'Subir',
      down: 'Bajar',
      confirmTitle: '¿Eliminar este elemento?',
      confirmBody: 'Se quitará de tu perfil y dejará de aparecer en los documentos que lo usaban. No se puede deshacer.',
      confirm: 'Sí, eliminar',
      pending: 'Guardando…',
      present: 'actual',
    },
    announce: {
      created: 'Elemento agregado.',
      updated: 'Cambios guardados.',
      deleted: 'Elemento eliminado.',
      moved: (title, place, of) => `«${title}» quedó en la posición ${place} de ${of}.`,
      rolledBack: 'No se pudo guardar; regresamos al estado anterior.',
    },
    errors: {
      required: 'Este campo es obligatorio.',
      tooLong: (max) => `Máximo ${max} caracteres.`,
      url: 'Escribe una dirección completa que empiece con https:// o http://.',
      date: 'Usa AAAA, AAAA-MM o AAAA-MM-DD.',
      email: 'Escribe un correo válido, como nombre@dominio.mx.',
      choice: 'Elige una de las opciones.',
      int: (min, max) => `Escribe un número entero entre ${min} y ${max}.`,
      tooMany: (max) => `Máximo ${max}.`,
      lineTooLong: (max) => `Cada línea admite hasta ${max} caracteres.`,
      row: (row) => `Enlace ${row}: `,
      server: 'El servidor rechazó este valor.',
      form: 'Revisa los campos marcados.',
    },
  },
  en: {
    intro: 'Your core profile: enter it once and reuse it in every application.',
    loading: 'Loading your profile…',
    requiredMark: '(required)',
    header: {
      title: 'Who you are',
      intro: 'This heads every CV, portfolio or presentation you prepare.',
      displayName: 'Name as you want it shown',
      displayNameHint: 'Exactly as it should read on your documents.',
      displayNameFromAccount: 'Taken from your Janua account; you can change it.',
      headline: 'Headline',
      headlineHint: 'One line: your trade or specialty. For example, “Data engineer”.',
      summary: 'Summary',
      summaryHint: 'A few lines about your career. You can adjust it for each job in each document.',
      locale: 'Profile language',
      localeHint: 'The language you write these details in.',
      locales: { 'es-MX': 'Spanish (Mexico)', en: 'English' },
      contactTitle: 'Contact',
      contactIntro: 'It only appears on a document if you choose to show it when you prepare it.',
      email: 'Email',
      phone: 'Phone',
      location: 'City or region',
      links: 'Your links',
      linksHint:
        'Links that identify you and go in the header: your site, LinkedIn, GitHub. For work samples you want to pick per job, use the “Links” section below. Only addresses starting with https:// or http://.',
      save: 'Save profile',
    },
    saveState: { clean: 'No pending changes.', dirty: 'You have unsaved changes.', saving: 'Saving…', saved: 'Profile saved.', failed: 'Not saved. Check the highlighted fields.' },
    links: { label: 'Name', url: 'Address (URL)', add: 'Add link', remove: 'Remove link', row: 'Link', empty: 'No links.' },
    empty: {
      title: 'Your profile is still empty',
      body: 'Every CV, portfolio or presentation you prepare for a job is built by choosing items from this profile. The richer it is, the more material you have to bring forward what each job asks for:',
      points: [
        'Experience with concrete achievements (what you did and what changed), not just the title.',
        'Projects with links to what can be seen or tried.',
        'Skills and languages with their level.',
        'Keywords on every item: we use them to compare your profile with the text of each job posting.',
      ],
    },
    itemsTitle: 'Your career',
    itemsIntro: 'Add each item once. The order you choose here is the starting order in your documents.',
    contents: 'Profile sections',
    countLabel: (n) => (n === 1 ? '1 item' : `${n} items`),
    kinds: {
      experience: { add: 'Add experience', empty: 'No work experience added yet.', newTitle: 'New experience', editTitle: 'Edit experience', hint: 'Jobs, contract work, freelance work or internships.' },
      education: { add: 'Add education', empty: 'No education added yet.', newTitle: 'New education', editTitle: 'Edit education', hint: 'Degrees, postgraduate studies, technical school, diplomas.' },
      project: { add: 'Add project', empty: 'No projects added yet.', newTitle: 'New project', editTitle: 'Edit project', hint: 'What you built or took part in, with links if it can be seen.' },
      skill: { add: 'Add skill', empty: 'No skills added yet.', newTitle: 'New skill', editTitle: 'Edit skill', hint: 'One skill per item: tools, techniques, knowledge.' },
      language: { add: 'Add language', empty: 'No languages added yet.', newTitle: 'New language', editTitle: 'Edit language', hint: 'Include your native language.' },
      certification: { add: 'Add certification', empty: 'No certifications added yet.', newTitle: 'New certification', editTitle: 'Edit certification', hint: 'With its expiry date, if it expires: recruiters check it.' },
      achievement: { add: 'Add achievement', empty: 'No achievements added yet.', newTitle: 'New achievement', editTitle: 'Edit achievement', hint: 'Results you want to be able to highlight on their own.' },
      award: { add: 'Add award', empty: 'No awards added yet.', newTitle: 'New award', editTitle: 'Edit award', hint: 'Prizes, scholarships, honours.' },
      publication: { add: 'Add publication', empty: 'No publications added yet.', newTitle: 'New publication', editTitle: 'Edit publication', hint: 'Articles, chapters, talks, blog posts.' },
      volunteering: { add: 'Add volunteering', empty: 'No volunteering added yet.', newTitle: 'New volunteering', editTitle: 'Edit volunteering', hint: 'Unpaid work for organisations or communities.' },
      link: { add: 'Add link', empty: 'No links added yet.', newTitle: 'New link', editTitle: 'Edit link', hint: 'Work samples you want to pick for each job (a video, a case study, a repository).' },
    },
    fields: {
      role: 'Job title',
      organization: 'Company or organisation',
      employmentType: 'Employment type',
      location: 'Location',
      startDate: 'Start',
      endDate: 'End',
      current: 'This is my current job',
      summary: 'Description',
      highlights: 'Achievements and responsibilities',
      institution: 'Institution',
      degree: 'Degree',
      field: 'Field of study',
      name: 'Name',
      level: 'Level',
      years: 'Years of experience',
      url: 'Link',
      links: 'Other links',
      issuer: 'Issued by',
      date: 'Date',
      expiresOn: 'Expires',
      credentialId: 'Credential ID',
      title: 'Title',
      publisher: 'Publisher or outlet',
      label: 'Link name',
    },
    fieldOverrides: {
      education: { highlights: 'Highlights' },
      skill: { name: 'Skill' },
      project: { name: 'Project name', role: 'Your role in the project', url: 'Main link', links: 'Other project links' },
      certification: { name: 'Certification', date: 'Issue date', url: 'Link to verify it' },
      language: { code: 'Language', name: 'Language name', level: 'Level (CEFR)' },
      achievement: { title: 'Achievement' },
      award: { title: 'Award', issuer: 'Awarded by' },
      publication: { date: 'Publication date' },
      volunteering: { role: 'Activity or role', organization: 'Organisation' },
      link: { url: 'Address (URL)' },
    },
    hints: {
      date: 'YYYY, YYYY-MM or YYYY-MM-DD; for example, 2021-03.',
      endDate: 'YYYY, YYYY-MM or YYYY-MM-DD. Leave it empty if it is ongoing.',
      highlights: 'One per line, up to 30. Start with a verb and, if you can, a measurable result.',
      url: 'A full address starting with https:// or http://.',
      links: 'For example, the source code and a demo. Only https:// or http://.',
      years: 'A whole number, from 0 to 80.',
    },
    options: {
      none: 'Not specified',
      employmentType: { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', freelance: 'Freelance', internship: 'Internship', volunteer: 'Volunteer', other: 'Other' },
      skillLevel: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' },
      languageLevel: { A1: 'A1 (beginner)', A2: 'A2 (elementary)', B1: 'B1 (intermediate)', B2: 'B2 (upper intermediate)', C1: 'C1 (advanced)', C2: 'C2 (proficient)', native: 'Native' },
    },
    tags: {
      label: 'Keywords',
      hint: 'Technologies, tools or topics of this item, separated by commas. We use them to compare it with the text of each job posting (keyword match, no AI): a keyword that appears in the posting weighs more than the rest of the text. Up to 50, 60 characters each.',
      add: 'Add',
      remove: 'Remove keyword',
      none: 'No keywords',
      listLabel: 'Keywords added',
    },
    actions: {
      edit: 'Edit',
      save: 'Save changes',
      saveNew: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      up: 'Move up',
      down: 'Move down',
      confirmTitle: 'Delete this item?',
      confirmBody: 'It will be removed from your profile and will no longer appear in the documents that used it. This cannot be undone.',
      confirm: 'Yes, delete',
      pending: 'Saving…',
      present: 'present',
    },
    announce: {
      created: 'Item added.',
      updated: 'Changes saved.',
      deleted: 'Item deleted.',
      moved: (title, place, of) => `“${title}” is now at position ${place} of ${of}.`,
      rolledBack: 'It could not be saved; we went back to the previous state.',
    },
    errors: {
      required: 'This field is required.',
      tooLong: (max) => `At most ${max} characters.`,
      url: 'Enter a full address starting with https:// or http://.',
      date: 'Use YYYY, YYYY-MM or YYYY-MM-DD.',
      email: 'Enter a valid email, like name@example.org.',
      choice: 'Choose one of the options.',
      int: (min, max) => `Enter a whole number between ${min} and ${max}.`,
      tooMany: (max) => `At most ${max}.`,
      lineTooLong: (max) => `Each line can hold up to ${max} characters.`,
      row: (row) => `Link ${row}: `,
      server: 'The server rejected this value.',
      form: 'Check the highlighted fields.',
    },
  },
};

/** The label of `field` in `kind` (its override, else the shared label, else the key itself: visible, never blank). */
export function fieldLabel(copy: ProfileCopy, kind: ItemKind | null, field: string): string {
  return (kind ? copy.fieldOverrides[kind]?.[field] : undefined) ?? copy.fields[field] ?? field;
}

/**
 * W7 (B3): «Ideas para ventas de lujo y retail», a guide folded inside the item forms of the kinds where retail and
 * luxury hiring looks for something specific (measurable sales results, clienteling and CRM, VIC events, product and
 * brand training, visual merchandising, languages with their level, team leadership). Tips and the format of an
 * example only: every figure in an example is marked as illustrative, nothing is filled in for the person (R85).
 * The keywords are suggestions the person can add to the item's tags with one click (the match reads tags).
 */
export interface SectorGuideKind {
  tips: readonly string[];
  examples: readonly string[];
  keywords: readonly string[];
}
export interface SectorGuideCopy {
  summary: string;
  intro: string;
  examplesLabel: string;
  keywordsLabel: string;
  keywordsHint: string;
  addKeyword: (keyword: string) => string;
  kinds: Partial<Record<ItemKind, SectorGuideKind>>;
}

export const SECTOR_GUIDE_COPY: Record<Locale, SectorGuideCopy> = {
  es: {
    summary: 'Ideas para ventas de lujo y retail',
    intro: 'En boutiques y tiendas de lujo se busca ver resultados medibles, relación con clientes y conocimiento de producto. Escribe solo cifras que puedas sostener en una entrevista.',
    examplesLabel: 'Ejemplos de formato (las cifras son ilustrativas: usa las tuyas)',
    keywordsLabel: 'Palabras clave sugeridas',
    keywordsHint: 'Agrégalas a este elemento si te describen: con ellas comparamos tu perfil con cada vacante.',
    addKeyword: (k) => `Sugerencia: agregar «${k}»`,
    kinds: {
      experience: {
        tips: [
          'Pon cifras: cumplimiento de meta (%), ticket promedio, unidades por transacción (UPT), conversión, tamaño y retención de tu cartera de clientes.',
          'Menciona el clienteling y las herramientas de CRM que usas, sin datos de tus clientes.',
          'Si coordinas a un equipo: cuántas personas, qué lograron y cómo las formaste.',
          'Discreción: si aún trabajas ahí, puedes describir tu empleo actual sin nombrarlo («boutique de alta joyería en CDMX»).',
        ],
        examples: [
          'Cumplí el 118 % de mi meta anual de ventas en 2025.',
          'Elevé el ticket promedio un 22 % con venta cruzada de joyería y accesorios.',
          'Desarrollé una cartera de 180 clientes activos con 65 % de recompra anual.',
          'Organicé 6 eventos privados para clientes VIC; 40 % de conversión en la semana del evento.',
        ],
        keywords: ['Clienteling', 'Venta consultiva', 'Experiencia del cliente', 'CRM', 'Cumplimiento de meta', 'Ticket promedio', 'Eventos VIC', 'Visual merchandising', 'Liderazgo de equipo'],
      },
      achievement: {
        tips: ['Un logro por elemento, con su número y su periodo.'],
        examples: ['Primer lugar regional en ventas, segundo trimestre de 2025.', 'Mayor conversión de la boutique en la temporada navideña de 2024 (31 %).'],
        keywords: ['Ventas', 'Cumplimiento de meta', 'Conversión'],
      },
      skill: {
        tips: ['Una habilidad por elemento, con su nivel.'],
        examples: ['Clienteling', 'Venta consultiva de alta joyería', 'Visual merchandising', 'Gestión de CRM', 'Protocolo de servicio', 'Punto de venta e inventario'],
        keywords: ['Lujo', 'Retail', 'Servicio al cliente'],
      },
      language: {
        tips: [
          'Si una casa pide inglés, indica tu nivel real (MCER) y, si tienes certificado, agrégalo en «Certificaciones».',
          'Si hablas un tercer idioma, agrégalo: algunas vacantes lo piden para atender clientela internacional.',
        ],
        examples: ['Inglés · C1 (avanzado)', 'Francés · B1 (intermedio)'],
        keywords: ['Bilingüe', 'Inglés'],
      },
      certification: {
        tips: ['Incluye las capacitaciones de producto y de marca que completaste (gemología, relojería, cuidado de la piel, servicio), con quien las impartió y el año.'],
        examples: ['Curso de diamantes y gemas de color, 2023', 'Programa de excelencia en servicio, 2024'],
        keywords: ['Gemología', 'Relojería', 'Capacitación de producto'],
      },
      project: {
        tips: ['Eventos, lanzamientos, montajes de vitrina o aperturas en las que participaste: tu papel y el resultado.'],
        examples: ['Apertura de boutique: capacitación del equipo y montaje de visual merchandising.', 'Lanzamiento de colección: evento privado para 60 clientes.'],
        keywords: ['Eventos', 'Lanzamiento', 'Visual merchandising', 'Apertura de tienda'],
      },
    },
  },
  en: {
    summary: 'Ideas for luxury and retail sales',
    intro: 'Luxury boutiques and stores look for measurable results, client relationships and product knowledge. Only write figures you can stand behind in an interview.',
    examplesLabel: 'Format examples (the figures are illustrative: use your own)',
    keywordsLabel: 'Suggested keywords',
    keywordsHint: 'Add them to this item if they describe you: we compare your profile with each posting through them.',
    addKeyword: (k) => `Suggestion: add “${k}”`,
    kinds: {
      experience: {
        tips: [
          'Use figures: target attainment (%), average ticket, units per transaction (UPT), conversion, size and retention of your client book.',
          'Mention clienteling and the CRM tools you use, without any client data.',
          'If you lead a team: how many people, what they achieved and how you trained them.',
          'Discretion: if you still work there, you can describe your current employer without naming it (“fine jewellery boutique in Mexico City”).',
        ],
        examples: [
          'Reached 118% of my annual sales target in 2025.',
          'Raised the average ticket by 22% through cross-selling jewellery and accessories.',
          'Built a book of 180 active clients with 65% yearly repeat purchases.',
          'Organised 6 private events for VIC clients; 40% conversion in the event week.',
        ],
        keywords: ['Clienteling', 'Consultative selling', 'Client experience', 'CRM', 'Target attainment', 'Average ticket', 'VIC events', 'Visual merchandising', 'Team leadership'],
      },
      achievement: {
        tips: ['One achievement per item, with its figure and its period.'],
        examples: ['First in regional sales, second quarter of 2025.', 'Highest conversion in the boutique over the 2024 holiday season (31%).'],
        keywords: ['Sales', 'Target attainment', 'Conversion'],
      },
      skill: {
        tips: ['One skill per item, with its level.'],
        examples: ['Clienteling', 'Consultative selling of fine jewellery', 'Visual merchandising', 'CRM management', 'Service etiquette', 'Point of sale and inventory'],
        keywords: ['Luxury', 'Retail', 'Customer service'],
      },
      language: {
        tips: [
          'If a house asks for English, state your real level (CEFR) and, if you hold a certificate, add it under “Certifications”.',
          'If you speak a third language, add it: some postings ask for one to serve international clients.',
        ],
        examples: ['English · C1 (advanced)', 'French · B1 (intermediate)'],
        keywords: ['Bilingual', 'English'],
      },
      certification: {
        tips: ['Include the product and brand trainings you completed (gemmology, watchmaking, skincare, service), who gave them and the year.'],
        examples: ['Diamonds and coloured gemstones course, 2023', 'Service excellence programme, 2024'],
        keywords: ['Gemmology', 'Watchmaking', 'Product training'],
      },
      project: {
        tips: ['Events, launches, window installations or openings you took part in: your role and the result.'],
        examples: ['Boutique opening: team training and visual merchandising set-up.', 'Collection launch: private event for 60 clients.'],
        keywords: ['Events', 'Launch', 'Visual merchandising', 'Store opening'],
      },
    },
  },
};
