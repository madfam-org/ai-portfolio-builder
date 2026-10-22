/**
 * Strings of data portability and data rights (W4-I): the import on `/perfil` (the person's own LinkedIn export ZIP or
 * a JSON Resume file, read in the browser, previewed, confirmed) and «Descargar mis datos» / «Eliminar mis datos» on
 * `/ajustes`. Truth rules (R85): say exactly what is read, what is ignored and when anything leaves the browser; no AI,
 * no scraping, no connection to the person's LinkedIn account.
 */
import type { Locale } from '../routing.ts';

export type ImportNoteCode = 'truncated' | 'date_dropped' | 'url_dropped' | 'value_dropped';

export interface ImportCopy {
  title: string;
  intro: string;
  privacyTitle: string;
  privacy: (files: string) => string[];
  linkedin: { title: string; how: string; label: string; hint: string };
  jsonResume: { title: string; how: string; label: string; hint: string };
  reading: string;
  errors: {
    notZip: string;
    tooLarge: string;
    tooManyEntries: string;
    unsupported: string;
    entryTooLarge: string;
    corrupt: string;
    notLinkedIn: string;
    notJsonResume: string;
    nothing: string;
    tooBig: string;
    tooManyItems: (max: number) => string;
    nothingChecked: string;
  };
  preview: {
    title: string;
    fromLinkedIn: string;
    fromJsonResume: string;
    read: (list: string) => string;
    ignored: (n: number) => string;
    skipped: (n: number) => string;
    headerTitle: string;
    headerHint: string;
    replaces: string;
    headerFields: { displayName: string; headline: string; summary: string; email: string; phone: string; location: string; links: string };
    exists: string;
    notes: Record<ImportNoteCode, string>;
    origin: (file: string, row: number) => string;
    selectAll: string;
    selectNone: string;
    count: (selected: number, total: number) => string;
    confirm: (n: number) => string;
    discard: string;
    saving: string;
    done: (n: number) => string;
    discarded: string;
    tags: string;
  };
}

export interface DataRightsCopy {
  intro: string;
  exportTitle: string;
  exportBody: string;
  exportButton: string;
  jsonResumeTitle: string;
  jsonResumeBody: string;
  jsonResumeButton: string;
  preparing: string;
  exported: string;
  deleteTitle: string;
  deleteBody: string;
  deletePoints: string[];
  accountNote: string;
  accountLink: string;
  deleteButton: string;
  dialogTitle: string;
  dialogBody: string;
  typeLabel: string;
  word: string;
  mismatch: string;
  confirm: string;
  cancel: string;
  deleting: string;
  deleted: (n: { profiles: number; items: number; jobs: number; artifacts: number }) => string;
}

export const IMPORT_COPY: Record<Locale, ImportCopy> = {
  es: {
    title: 'Importar tus datos',
    intro: 'Trae a tu perfil lo que ya escribiste en otro lado: la copia de tus propios datos que LinkedIn te deja descargar, o un currículum en formato JSON Resume. Revisas cada elemento antes de guardarlo.',
    privacyTitle: 'Qué pasa con tu archivo',
    privacy: (files) => [
      'El archivo se lee aquí, en tu navegador. No se sube a ningún servidor.',
      `Del ZIP de LinkedIn abrimos solo estos archivos: ${files}. Los demás (mensajes, contactos, invitaciones, anuncios y todo lo demás) no se abren ni se guardan; solo vemos sus nombres en el índice del ZIP.`,
      'Nada sale de tu navegador hasta que confirmas, y entonces solo se envía lo que dejaste marcado.',
      'No nos conectamos a tu cuenta de LinkedIn ni extraemos datos de otros sitios.',
    ],
    linkedin: {
      title: 'Desde LinkedIn',
      how: 'En LinkedIn, desde una computadora: Yo → Configuración y privacidad → Privacidad de datos → Descargar tus datos. Solicita el archivo y descarga el ZIP del enlace que te envían por correo (vence en 72 horas).',
      label: 'ZIP de tus datos de LinkedIn',
      hint: 'El archivo .zip tal como lo descargaste, hasta 300 MB.',
    },
    jsonResume: {
      title: 'Desde JSON Resume',
      how: 'Un archivo .json en el formato abierto de jsonresume.org, por ejemplo exportado desde otra herramienta de CV.',
      label: 'Archivo JSON Resume',
      hint: 'Un archivo .json de hasta 2 MB.',
    },
    reading: 'Leyendo el archivo en tu navegador…',
    errors: {
      notZip: 'Ese archivo no es un ZIP válido.',
      tooLarge: 'El archivo pasa de 300 MB. Pide a LinkedIn solo las categorías de tu perfil y vuelve a intentarlo.',
      tooManyEntries: 'El ZIP tiene demasiados archivos para revisarlo aquí.',
      unsupported: 'El ZIP usa cifrado o una compresión que no podemos leer.',
      entryTooLarge: 'Uno de los archivos de perfil dentro del ZIP es demasiado grande.',
      corrupt: 'El ZIP está dañado o incompleto. Descárgalo de nuevo.',
      notLinkedIn: 'Este ZIP no contiene ninguno de los archivos de perfil de LinkedIn que leemos.',
      notJsonResume: 'Este archivo no es un JSON Resume: no es JSON válido o no tiene secciones como «basics» o «work».',
      nothing: 'No encontramos nada que importar en este archivo.',
      tooBig: 'Lo marcado es demasiado grande para enviarlo de una vez. Desmarca algunos elementos e inténtalo de nuevo.',
      tooManyItems: (max) => `Puedes importar hasta ${max} elementos a la vez. Desmarca algunos.`,
      nothingChecked: 'Marca al menos un elemento.',
    },
    preview: {
      title: 'Revisa antes de guardar',
      fromLinkedIn: 'Leído de tu ZIP de LinkedIn.',
      fromJsonResume: 'Leído de tu archivo JSON Resume.',
      read: (list) => `Leímos: ${list}.`,
      ignored: (n) => (n === 1 ? 'Otro archivo o sección no se leyó.' : `Otros ${n} archivos o secciones no se leyeron.`),
      skipped: (n) => (n === 1 ? 'Una fila no tenía los datos mínimos (por ejemplo, cargo y empresa) y no se incluye.' : `${n} filas no tenían los datos mínimos (por ejemplo, cargo y empresa) y no se incluyen.`),
      headerTitle: 'Tu encabezado',
      headerHint: 'Viene marcado solo lo que hoy está vacío en tu perfil. Si marcas otro campo, reemplaza lo que tienes; los enlaces se agregan.',
      replaces: 'reemplaza lo actual',
      headerFields: { displayName: 'Nombre', headline: 'Titular', summary: 'Resumen', email: 'Correo', phone: 'Teléfono', location: 'Ciudad o región', links: 'Enlaces' },
      exists: 'ya existe en tu perfil',
      notes: {
        truncated: 'recortado al largo máximo',
        date_dropped: 'una fecha no se pudo leer y se omitió',
        url_dropped: 'un enlace no válido se omitió',
        value_dropped: 'un valor no reconocido se omitió',
      },
      origin: (file, row) => `${file}, fila ${row}`,
      selectAll: 'Marcar todo',
      selectNone: 'Desmarcar todo',
      count: (selected, total) => `${selected} de ${total} marcados`,
      confirm: (n) => (n === 1 ? 'Importar 1 elemento' : `Importar ${n} elementos`),
      discard: 'Descartar',
      saving: 'Guardando…',
      done: (n) => (n === 1 ? 'Importamos 1 elemento a tu perfil.' : `Importamos ${n} elementos a tu perfil.`),
      discarded: 'Descartado. No se envió nada.',
      tags: 'Palabras clave',
    },
  },
  en: {
    title: 'Import your data',
    intro: 'Bring into your profile what you already wrote elsewhere: the copy of your own data LinkedIn lets you download, or a résumé in JSON Resume format. You review every item before it is saved.',
    privacyTitle: 'What happens to your file',
    privacy: (files) => [
      'The file is read here, in your browser. It is not uploaded to any server.',
      `From the LinkedIn ZIP we open only these files: ${files}. The rest (messages, connections, invitations, ads and everything else) are never opened or kept; we only see their names in the ZIP's index.`,
      'Nothing leaves your browser until you confirm, and then only what you left checked is sent.',
      'We do not connect to your LinkedIn account or scrape any site.',
    ],
    linkedin: {
      title: 'From LinkedIn',
      how: 'On LinkedIn, from a computer: Me → Settings & Privacy → Data privacy → Download your data. Request the archive and download the ZIP from the link they email you (it expires after 72 hours).',
      label: 'Your LinkedIn data ZIP',
      hint: 'The .zip file as you downloaded it, up to 300 MB.',
    },
    jsonResume: {
      title: 'From JSON Resume',
      how: 'A .json file in the open jsonresume.org format, for example exported from another CV tool.',
      label: 'JSON Resume file',
      hint: 'A .json file up to 2 MB.',
    },
    reading: 'Reading the file in your browser…',
    errors: {
      notZip: 'That file is not a valid ZIP.',
      tooLarge: 'The file is over 300 MB. Ask LinkedIn for your profile categories only and try again.',
      tooManyEntries: 'The ZIP has too many files to review here.',
      unsupported: 'The ZIP uses encryption or a compression we cannot read.',
      entryTooLarge: 'One of the profile files inside the ZIP is too large.',
      corrupt: 'The ZIP is damaged or incomplete. Download it again.',
      notLinkedIn: 'This ZIP holds none of the LinkedIn profile files we read.',
      notJsonResume: 'This file is not a JSON Resume: it is not valid JSON or has no sections such as "basics" or "work".',
      nothing: 'We found nothing to import in this file.',
      tooBig: 'What you checked is too large to send at once. Uncheck some items and try again.',
      tooManyItems: (max) => `You can import up to ${max} items at once. Uncheck some.`,
      nothingChecked: 'Check at least one item.',
    },
    preview: {
      title: 'Review before saving',
      fromLinkedIn: 'Read from your LinkedIn ZIP.',
      fromJsonResume: 'Read from your JSON Resume file.',
      read: (list) => `We read: ${list}.`,
      ignored: (n) => (n === 1 ? 'One other file or section was not read.' : `${n} other files or sections were not read.`),
      skipped: (n) => (n === 1 ? 'One row lacked the minimum (for example, role and company) and is left out.' : `${n} rows lacked the minimum (for example, role and company) and are left out.`),
      headerTitle: 'Your header',
      headerHint: 'Only what is empty in your profile today comes checked. Checking another field replaces what you have; links are added.',
      replaces: 'replaces the current value',
      headerFields: { displayName: 'Name', headline: 'Headline', summary: 'Summary', email: 'Email', phone: 'Phone', location: 'City or region', links: 'Links' },
      exists: 'already in your profile',
      notes: {
        truncated: 'cut to the maximum length',
        date_dropped: 'a date could not be read and was left out',
        url_dropped: 'an invalid link was left out',
        value_dropped: 'an unrecognized value was left out',
      },
      origin: (file, row) => `${file}, row ${row}`,
      selectAll: 'Check all',
      selectNone: 'Uncheck all',
      count: (selected, total) => `${selected} of ${total} checked`,
      confirm: (n) => (n === 1 ? 'Import 1 item' : `Import ${n} items`),
      discard: 'Discard',
      saving: 'Saving…',
      done: (n) => (n === 1 ? 'We imported 1 item into your profile.' : `We imported ${n} items into your profile.`),
      discarded: 'Discarded. Nothing was sent.',
      tags: 'Keywords',
    },
  },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const DATA_RIGHTS_COPY: Record<Locale, DataRightsCopy> = {
  es: {
    intro: 'Tus datos son tuyos: puedes llevártelos o borrarlos cuando quieras.',
    exportTitle: 'Descargar mis datos',
    exportBody: 'Un archivo JSON con todo lo que guardamos de ti: tu perfil y cada uno de sus elementos, tus empleos y tus documentos, incluido cómo los compartes (enlace privado o página pública).',
    exportButton: 'Descargar mis datos (JSON)',
    jsonResumeTitle: 'Exportar como JSON Resume',
    jsonResumeBody: 'Solo tu perfil, en el formato abierto de jsonresume.org, para usarlo en otras herramientas de CV. Lo que ese formato no contempla (por ejemplo, el tipo de empleo) queda solo en la descarga completa.',
    jsonResumeButton: 'Exportar como JSON Resume',
    preparing: 'Preparando el archivo…',
    exported: 'Listo: revisa tus descargas.',
    deleteTitle: 'Eliminar mis datos',
    deleteBody: 'Borra de esta aplicación todo lo que guardamos de ti, en un solo paso:',
    deletePoints: [
      'tu perfil y todos sus elementos;',
      'tus empleos y tus documentos;',
      'tus publicaciones: las páginas y los enlaces compartidos dejan de verse de inmediato.',
    ],
    accountNote: 'Esto no borra tu cuenta de Janua, la que usas para entrar: esa cuenta se administra en Janua. No se puede deshacer; si quieres conservar algo, descarga tus datos antes.',
    accountLink: 'Ir a Janua',
    deleteButton: 'Eliminar mis datos…',
    dialogTitle: '¿Eliminar todos tus datos?',
    dialogBody: 'Se borran tu perfil, tus empleos y tus documentos, y tus páginas publicadas dejan de verse. No se puede deshacer.',
    typeLabel: 'Para confirmar, escribe ELIMINAR',
    word: 'ELIMINAR',
    mismatch: 'Escribe ELIMINAR, en mayúsculas, para confirmar.',
    confirm: 'Eliminar todo',
    cancel: 'Cancelar',
    deleting: 'Eliminando…',
    deleted: (n) =>
      `Eliminamos tus datos: ${plural(n.items, 'elemento', 'elementos')} del perfil, ${plural(n.jobs, 'empleo', 'empleos')} y ${plural(n.artifacts, 'documento', 'documentos')}. Tu cuenta de Janua sigue activa.`,
  },
  en: {
    intro: 'Your data is yours: take it with you or delete it whenever you want.',
    exportTitle: 'Download my data',
    exportBody: 'A JSON file with everything we keep about you: your profile and each of its items, your jobs and your documents, including how you share them (private link or public page).',
    exportButton: 'Download my data (JSON)',
    jsonResumeTitle: 'Export as JSON Resume',
    jsonResumeBody: 'Your profile only, in the open jsonresume.org format, to use in other CV tools. What that format has no place for (such as employment type) stays in the full download only.',
    jsonResumeButton: 'Export as JSON Resume',
    preparing: 'Preparing the file…',
    exported: 'Done: check your downloads.',
    deleteTitle: 'Delete my data',
    deleteBody: 'Deletes from this app everything we keep about you, in one step:',
    deletePoints: ['your profile and all its items;', 'your jobs and your documents;', 'your publications: pages and shared links stop showing at once.'],
    accountNote: 'This does not delete your Janua account, the one you sign in with: that account is managed in Janua. It cannot be undone; if you want to keep anything, download your data first.',
    accountLink: 'Go to Janua',
    deleteButton: 'Delete my data…',
    dialogTitle: 'Delete all your data?',
    dialogBody: 'Your profile, jobs and documents are deleted, and your published pages stop showing. This cannot be undone.',
    typeLabel: 'To confirm, type DELETE',
    word: 'DELETE',
    mismatch: 'Type DELETE, in capitals, to confirm.',
    confirm: 'Delete everything',
    cancel: 'Cancel',
    deleting: 'Deleting…',
    deleted: (n) =>
      `We deleted your data: ${plural(n.items, 'profile item', 'profile items')}, ${plural(n.jobs, 'job', 'jobs')} and ${plural(n.artifacts, 'document', 'documents')}. Your Janua account is still active.`,
  },
};
