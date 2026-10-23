/**
 * Strings of the job intake (W5-J): `/empleos/nuevo` (link, paste, file, «Capturar desde tu navegador») and
 * `/empleos/capturar` (the window the bookmarklet opens). Truth rules (R85): say when cv reads a page and when it does
 * not, never call the parsing AI, never promise what is not built («aún no leemos imágenes»).
 */
import type { EmploymentType, IntakeFailure, IntakeNote, Provenance, SalaryPeriod, WorkMode } from '../client/types.ts';
import type { Locale } from '../routing.ts';

export interface IngestCopy {
  title: string;
  intro: string;
  back: string;
  methodsLabel: string;
  link: { title: string; body: string; label: string; hint: string; submit: string; reading: string };
  paste: { title: string; body: string; label: string; submit: string };
  file: { title: string; body: string; label: string; hint: string; reading: string };
  capture: {
    title: string;
    body: string;
    linkLabel: string;
    drag: string;
    copyLabel: string;
    copyHint: string;
    boards: string;
    privacy: string;
  };
  receiver: { title: string; waiting: string; none: string; reading: string; fromPage: (host: string) => string };
  preview: {
    title: string;
    body: string;
    edited: string;
    sourceUrl: string;
    sourceText: string;
    save: string;
    saving: string;
    discard: string;
    salaryLegend: string;
    min: string;
    max: string;
    currency: string;
    currencyHint: string;
    period: string;
    country: string;
    countryHint: string;
    state: string;
    employmentType: string;
    workMode: string;
    datePosted: string;
    validThrough: string;
    none: string;
    viaProvider: (provider: string) => string;
  };
  fields: { title: string; company: string; location: string };
  from: Record<Provenance, string>;
  notes: Record<IntakeNote, string>;
  failures: Record<IntakeFailure, string>;
  fallback: string;
  fileErrors: { image: string; scanned: string; unsupported: string; tooLarge: string; unreadable: string; pdfFailed: string };
  rateLimited: (seconds: number) => string;
  quota: string;
  saveFailed: string;
  invalidSalary: string;
  employmentTypes: Record<EmploymentType, string>;
  workModes: Record<WorkMode, string>;
  periods: Record<SalaryPeriod, string>;
  created: string;
  /** On the job page, for a job read from its link (replaces «no lo visitamos», which is no longer true for it). */
  readOnce: string;
  /** On /empleos: the way to the intake page. */
  addMore: string;
}

export const MX_STATE_NAMES: Record<string, string> = {
  'MX-AGU': 'Aguascalientes', 'MX-BCN': 'Baja California', 'MX-BCS': 'Baja California Sur', 'MX-CAM': 'Campeche', 'MX-CHP': 'Chiapas',
  'MX-CHH': 'Chihuahua', 'MX-CMX': 'Ciudad de México', 'MX-COA': 'Coahuila', 'MX-COL': 'Colima', 'MX-DUR': 'Durango', 'MX-GUA': 'Guanajuato',
  'MX-GRO': 'Guerrero', 'MX-HID': 'Hidalgo', 'MX-JAL': 'Jalisco', 'MX-MEX': 'Estado de México', 'MX-MIC': 'Michoacán', 'MX-MOR': 'Morelos',
  'MX-NAY': 'Nayarit', 'MX-NLE': 'Nuevo León', 'MX-OAX': 'Oaxaca', 'MX-PUE': 'Puebla', 'MX-QUE': 'Querétaro', 'MX-ROO': 'Quintana Roo',
  'MX-SLP': 'San Luis Potosí', 'MX-SIN': 'Sinaloa', 'MX-SON': 'Sonora', 'MX-TAB': 'Tabasco', 'MX-TAM': 'Tamaulipas', 'MX-TLA': 'Tlaxcala',
  'MX-VER': 'Veracruz', 'MX-YUC': 'Yucatán', 'MX-ZAC': 'Zacatecas',
};

const es: IngestCopy = {
  title: 'Agregar una vacante',
  intro: 'Trae la vacante como la tengas: un enlace, el texto, un archivo o la página que ya tienes abierta. Antes de guardar verás lo que leímos y de dónde salió cada dato, y podrás corregirlo.',
  back: 'Volver a empleos',
  methodsLabel: 'Formas de agregar una vacante',
  link: {
    title: 'Desde un enlace',
    body: 'Leemos la página una sola vez, solo cuando lo pides, y respetamos las reglas del sitio (robots.txt). LinkedIn, Indeed, Google, Glassdoor, Talent.com y Computrabajo no permiten que un servidor lea sus páginas: para ellos usa «Capturar desde tu navegador».',
    label: 'Enlace de la vacante',
    hint: 'Debe empezar con https://',
    submit: 'Leer vacante',
    reading: 'Leyendo la vacante…',
  },
  paste: { title: 'Pegar el texto', body: 'Copia la vacante completa y pégala aquí. Leemos las líneas con etiqueta («Empresa:», «Ubicación:», «Sueldo:»…).', label: 'Texto de la vacante', submit: 'Revisar' },
  file: {
    title: 'Desde un archivo',
    body: 'PDF con texto, Word (.docx), texto (.txt) o una página guardada (.html). El archivo se lee aquí, en tu navegador; solo enviamos el texto que ves en la revisión.',
    label: 'Archivo de la vacante',
    hint: 'PDF, DOCX, TXT o HTML, hasta 20 MB.',
    reading: 'Leyendo el archivo…',
  },
  capture: {
    title: 'Capturar desde tu navegador',
    body: 'Para sitios que no dejan que un servidor lea sus páginas. Arrastra este botón a tu barra de marcadores. Cuando tengas una vacante abierta, haz clic en el marcador: tu navegador toma el texto de esa página y lo abre aquí para revisarlo. No usamos tu sesión en ese sitio ni guardamos nada hasta que confirmes.',
    linkLabel: 'Capturar vacante',
    drag: 'Arrástralo a la barra de marcadores (no funciona con un clic aquí).',
    copyLabel: 'Código del marcador',
    copyHint: 'En el teléfono: crea un marcador de cualquier página y reemplaza su dirección con este código.',
    boards: 'Funciona en cualquier sitio de vacantes, también en LinkedIn, Indeed, OCC, Computrabajo o Bumeran.',
    privacy: 'El marcador lee solo la página abierta: su texto visible, sus datos estructurados de vacante (JSON-LD) y su dirección.',
  },
  receiver: {
    title: 'Vacante capturada',
    waiting: 'Leyendo lo que capturó tu navegador…',
    none: 'No llegó ninguna captura. Abre una vacante y usa el marcador «Capturar vacante», o agrega la vacante de otra forma.',
    reading: 'Revisando la captura…',
    fromPage: (host) => `Capturada en ${host}`,
  },
  preview: {
    title: 'Revisa antes de guardar',
    body: 'Junto a cada dato verás de dónde salió. Corrige lo que haga falta; nada se guarda hasta que elijas «Guardar vacante».',
    edited: 'editado por ti',
    sourceUrl: 'Enlace de la vacante',
    sourceText: 'Texto de la vacante',
    save: 'Guardar vacante',
    saving: 'Guardando…',
    discard: 'Descartar',
    salaryLegend: 'Sueldo (solo si la vacante lo dice)',
    min: 'Mínimo',
    max: 'Máximo',
    currency: 'Moneda',
    currencyHint: 'Código de tres letras, p. ej. MXN o USD.',
    period: 'Periodo',
    country: 'País',
    countryHint: 'Código de dos letras, p. ej. MX.',
    state: 'Estado',
    employmentType: 'Tipo de empleo',
    workMode: 'Modalidad',
    datePosted: 'Publicada',
    validThrough: 'Vigente hasta',
    none: '— Sin dato —',
    viaProvider: (p) => `Leída con la API pública de ${p}.`,
  },
  fields: { title: 'Puesto', company: 'Empresa', location: 'Ubicación' },
  from: {
    'json-ld': 'de los datos estructurados (JSON-LD)',
    microdata: 'de los microdatos de la página',
    'open-graph': 'de la vista previa de la página (Open Graph)',
    'ats-api': 'de la API pública del sistema de reclutamiento',
    'page-title': 'del título de la página',
    'labeled-text': 'de una línea con etiqueta en el texto',
    'first-line': 'primera línea del texto (sugerencia: revísala)',
    text: 'del texto',
  },
  notes: {
    several_postings: 'La página tenía varias vacantes; tomamos la primera. Revisa que sea la correcta.',
    text_truncated: 'El texto era muy largo; guardamos los primeros 50 000 caracteres.',
    title_missing: 'No encontramos el puesto: escríbelo.',
    no_structured_data: 'La página no traía datos estructurados de vacante; leímos su texto.',
    ats_fallback: 'La API del sistema de reclutamiento no respondió; leímos la página.',
    salary_partial: 'El sueldo no dice moneda o periodo; complétalos solo si los conoces.',
  },
  failures: {
    unreadable: 'No pudimos leer esta vacante. Pégala o súbela como archivo.',
    posting_closed: 'La página dice que esta vacante ya no está abierta (cubierta o cerrada). Si la ves abierta en tu navegador, captúrala desde ahí o pega su texto.',
    capture_only: '{board} no permite que un servidor lea sus vacantes. Usa «Capturar desde tu navegador» con la vacante abierta, o pega su texto.',
    robots_disallowed: 'Este sitio pide que no leamos esa página (robots.txt). Pega la vacante, súbela o captúrala desde tu navegador.',
    robots_unreachable: 'No pudimos consultar las reglas de este sitio (robots.txt), así que no leímos la página. Pégala, súbela o captúrala desde tu navegador.',
    invalid_url: 'Ese enlace no es válido.',
    not_https: 'Solo leemos enlaces que empiezan con https://.',
    bad_port: 'Solo leemos enlaces web normales (sin puerto especial).',
    credentials: 'El enlace trae usuario o contraseña; no lo usamos. Copia el enlace público de la vacante.',
    blocked_host: 'Ese enlace no apunta a un sitio público.',
    private_address: 'Ese enlace apunta a una dirección privada; no la leemos.',
    dns_failed: 'No encontramos ese sitio. Revisa el enlace.',
    too_many_redirects: 'El sitio redirige demasiadas veces.',
    http_status: 'El sitio respondió con un error ({status}). Pega la vacante o súbela.',
    blocked_by_site: 'El sitio bloqueó la lectura automática ({status}). No intentamos saltarnos ese bloqueo: captúrala desde tu navegador, pégala o súbela.',
    unsupported_type: 'Ese enlace no es una página de vacante (por ejemplo, un archivo). Si es un PDF, descárgalo y súbelo.',
    too_large: 'La página es demasiado grande para leerla.',
    timeout: 'El sitio tardó demasiado en responder.',
    network: 'No pudimos conectar con ese sitio.',
  },
  fallback: 'Puedes pegar el texto o subir un archivo con las opciones de abajo.',
  fileErrors: {
    image: 'Aún no leemos imágenes ni PDF escaneados (necesitan reconocimiento de texto). Copia el texto de la vacante y pégalo.',
    scanned: 'Este PDF no tiene texto seleccionable (parece escaneado). Aún no leemos imágenes: copia el texto de la vacante y pégalo.',
    unsupported: 'Ese tipo de archivo no lo leemos. Usa PDF, DOCX, TXT o HTML.',
    tooLarge: 'El archivo pasa de 20 MB.',
    unreadable: 'No pudimos leer ese archivo. Pega el texto de la vacante.',
    pdfFailed: 'No pudimos abrir ese PDF. Si está protegido, copia el texto y pégalo.',
  },
  rateLimited: (s) => `Hiciste muchas lecturas seguidas. Intenta de nuevo en ${Math.ceil(s / 60)} min.`,
  quota: 'Llegaste al máximo de vacantes guardadas. Archiva o borra alguna para agregar otra.',
  saveFailed: 'No se pudo guardar. Revisa los datos marcados.',
  invalidSalary: 'Revisa el sueldo: el mínimo no puede ser mayor que el máximo, y la moneda o el periodo necesitan una cantidad.',
  employmentTypes: {
    full_time: 'Tiempo completo',
    part_time: 'Medio tiempo',
    contract: 'Por proyecto / contrato',
    temporary: 'Temporal',
    internship: 'Prácticas',
    volunteer: 'Voluntariado',
    per_diem: 'Por día',
    other: 'Otro',
  },
  workModes: { onsite: 'Presencial', hybrid: 'Híbrido', remote: 'Remoto' },
  periods: { hour: 'por hora', day: 'por día', week: 'por semana', month: 'al mes', year: 'al año' },
  created: 'Vacante guardada.',
  readOnce: 'Leímos esta página una vez, cuando lo pediste; no volvemos a visitarla.',
  addMore: 'Agregar desde un enlace, un archivo o tu navegador',
};

const en: IngestCopy = {
  title: 'Add a job posting',
  intro: 'Bring the posting however you have it: a link, the text, a file or the page you already have open. Before saving you will see what we read and where each detail came from, and you can correct it.',
  back: 'Back to jobs',
  methodsLabel: 'Ways to add a job posting',
  link: {
    title: 'From a link',
    body: 'We read the page once, only when you ask, and follow the site’s rules (robots.txt). LinkedIn, Indeed, Google, Glassdoor, Talent.com and Computrabajo do not allow a server to read their pages: for those, use «Capture from your browser».',
    label: 'Job posting link',
    hint: 'It must start with https://',
    submit: 'Read posting',
    reading: 'Reading the posting…',
  },
  paste: { title: 'Paste the text', body: 'Copy the whole posting and paste it here. We read labeled lines («Company:», «Location:», «Salary:»…).', label: 'Posting text', submit: 'Review' },
  file: {
    title: 'From a file',
    body: 'A PDF with text, Word (.docx), text (.txt) or a saved page (.html). The file is read here, in your browser; we only send the text you see in the review.',
    label: 'Posting file',
    hint: 'PDF, DOCX, TXT or HTML, up to 20 MB.',
    reading: 'Reading the file…',
  },
  capture: {
    title: 'Capture from your browser',
    body: 'For sites that do not let a server read their pages. Drag this button to your bookmarks bar. With a posting open, click the bookmark: your browser takes that page’s text and opens it here for review. We do not use your session on that site and store nothing until you confirm.',
    linkLabel: 'Capture posting',
    drag: 'Drag it to the bookmarks bar (clicking it here does nothing).',
    copyLabel: 'Bookmark code',
    copyHint: 'On a phone: bookmark any page, then replace the bookmark’s address with this code.',
    boards: 'It works on any job site, including LinkedIn, Indeed, OCC, Computrabajo or Bumeran.',
    privacy: 'The bookmark reads only the open page: its visible text, its structured job data (JSON-LD) and its address.',
  },
  receiver: {
    title: 'Captured posting',
    waiting: 'Reading what your browser captured…',
    none: 'No capture arrived. Open a posting and use the «Capture posting» bookmark, or add the posting another way.',
    reading: 'Reviewing the capture…',
    fromPage: (host) => `Captured on ${host}`,
  },
  preview: {
    title: 'Review before saving',
    body: 'Next to each detail you will see where it came from. Correct what you need; nothing is saved until you choose «Save posting».',
    edited: 'edited by you',
    sourceUrl: 'Posting link',
    sourceText: 'Posting text',
    save: 'Save posting',
    saving: 'Saving…',
    discard: 'Discard',
    salaryLegend: 'Salary (only if the posting states it)',
    min: 'Minimum',
    max: 'Maximum',
    currency: 'Currency',
    currencyHint: 'Three-letter code, e.g. MXN or USD.',
    period: 'Period',
    country: 'Country',
    countryHint: 'Two-letter code, e.g. MX.',
    state: 'State (Mexico)',
    employmentType: 'Employment type',
    workMode: 'Work mode',
    datePosted: 'Posted',
    validThrough: 'Open until',
    none: '— Not stated —',
    viaProvider: (p) => `Read with ${p}’s public API.`,
  },
  fields: { title: 'Job title', company: 'Company', location: 'Location' },
  from: {
    'json-ld': 'from the structured data (JSON-LD)',
    microdata: 'from the page’s microdata',
    'open-graph': 'from the page preview (Open Graph)',
    'ats-api': 'from the recruiting system’s public API',
    'page-title': 'from the page title',
    'labeled-text': 'from a labeled line in the text',
    'first-line': 'first line of the text (a suggestion: check it)',
    text: 'from the text',
  },
  notes: {
    several_postings: 'The page had several postings; we took the first. Check it is the right one.',
    text_truncated: 'The text was very long; we keep the first 50,000 characters.',
    title_missing: 'We did not find the job title: type it.',
    no_structured_data: 'The page had no structured job data; we read its text.',
    ats_fallback: 'The recruiting system’s API did not answer; we read the page.',
    salary_partial: 'The salary states no currency or period; fill them in only if you know them.',
  },
  failures: {
    unreadable: 'We could not read this posting. Paste it or upload it as a file.',
    posting_closed: 'The page says this posting is no longer open (filled or closed). If you see it open in your browser, capture it from there or paste its text.',
    capture_only: '{board} does not allow a server to read its postings. Use «Capture from your browser» with the posting open, or paste its text.',
    robots_disallowed: 'This site asks us not to read that page (robots.txt). Paste the posting, upload it or capture it from your browser.',
    robots_unreachable: 'We could not check this site’s rules (robots.txt), so we did not read the page. Paste it, upload it or capture it from your browser.',
    invalid_url: 'That link is not valid.',
    not_https: 'We only read links that start with https://.',
    bad_port: 'We only read ordinary web links (no special port).',
    credentials: 'The link carries a user name or password; we do not use it. Copy the posting’s public link.',
    blocked_host: 'That link does not point to a public site.',
    private_address: 'That link points to a private address; we do not read it.',
    dns_failed: 'We could not find that site. Check the link.',
    too_many_redirects: 'The site redirects too many times.',
    http_status: 'The site answered with an error ({status}). Paste the posting or upload it.',
    blocked_by_site: 'The site blocked automated reading ({status}). We do not try to get around that: capture it from your browser, paste it or upload it.',
    unsupported_type: 'That link is not a posting page (a file, for example). If it is a PDF, download it and upload it.',
    too_large: 'The page is too large to read.',
    timeout: 'The site took too long to answer.',
    network: 'We could not connect to that site.',
  },
  fallback: 'You can paste the text or upload a file with the options below.',
  fileErrors: {
    image: 'We do not read images or scanned PDFs yet (they need text recognition). Copy the posting’s text and paste it.',
    scanned: 'This PDF has no selectable text (it looks scanned). We do not read images yet: copy the posting’s text and paste it.',
    unsupported: 'We do not read that file type. Use PDF, DOCX, TXT or HTML.',
    tooLarge: 'The file is over 20 MB.',
    unreadable: 'We could not read that file. Paste the posting’s text.',
    pdfFailed: 'We could not open that PDF. If it is protected, copy the text and paste it.',
  },
  rateLimited: (s) => `You made many reads in a row. Try again in ${Math.ceil(s / 60)} min.`,
  quota: 'You reached the most saved jobs. Archive or delete one to add another.',
  saveFailed: 'It could not be saved. Check the marked details.',
  invalidSalary: 'Check the salary: the minimum cannot exceed the maximum, and a currency or period needs an amount.',
  employmentTypes: {
    full_time: 'Full time',
    part_time: 'Part time',
    contract: 'Contract / project',
    temporary: 'Temporary',
    internship: 'Internship',
    volunteer: 'Volunteer',
    per_diem: 'Per diem',
    other: 'Other',
  },
  workModes: { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' },
  periods: { hour: 'per hour', day: 'per day', week: 'per week', month: 'per month', year: 'per year' },
  created: 'Posting saved.',
  readOnce: 'We read this page once, when you asked; we never visit it again.',
  addMore: 'Add from a link, a file or your browser',
};

export const INGEST_COPY: Record<Locale, IngestCopy> = { es, en };
