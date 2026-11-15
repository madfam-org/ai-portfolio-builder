/**
 * cv's own privacy notice (`/privacidad`, `/en/privacidad` on the landing host), es-MX source and en.
 *
 * Law: the Ley Federal de Protección de Datos Personales en Posesión de los Particulares published in the DOF on
 * 2025-03-20 (a new law, not the 2010 one; its article numbers differ). Read for this text: art. 15 (what a notice
 * must contain, fractions I-VI), art. 16 (how it is made available), arts. 21-34 (the ARCO rights; art. 31: twenty
 * days to answer, fifteen to make it effective, each extendable once), art. 40 (the request to the authority, the
 * Secretaría Anticorrupción y Buen Gobierno). The section ids below map to art. 15's fractions; a unit test keeps
 * every one of them present in both languages.
 *
 * STATUS: APPROVED by the owner on 2026-11-15 (version 2026-11-15.3; text unchanged from .2). A later change to the
 * text returns it to `draft` with what is pending, until the owner approves again; the page shows either state.
 * Every statement describes code that exists (R85); when the product changes what it does with personal data,
 * this file changes in the same pull request and `version` moves.
 */
import type { Locale } from '../routing.ts';

export const PRIVACY_NOTICE = {
  version: '2026-11-15.3',
  status: 'approved' as 'draft' | 'approved',
  updated: '2026-11-15',
  mailbox: 'privacy@madfam.io',
  /** Open points, by key; the copy below names each in both languages. Empty when approved. */
  pending: [] as readonly string[],
} as const;

/** art. 15: I responsable, II datos, III finalidades, IV limitar, V arco, VI cambios. The rest is context. */
export const REQUIRED_SECTION_IDS = ['responsable', 'datos', 'finalidades', 'limitar', 'arco', 'cambios'] as const;

export interface PrivacySection {
  id: string;
  title: string;
  body: string[];
  list?: string[];
}

export interface PrivacyCopy {
  meta: { title: string; description: string };
  badge: string;
  draftBadge: string;
  headline: string;
  lead: string;
  versionLabel: string;
  /** The simplified notice (art. 16 fr. II): shown first on the page and beside «Primeros pasos». */
  summaryTitle: string;
  summary: string[];
  pendingTitle: string;
  pending: Record<string, string>;
  sections: PrivacySection[];
  languageNote: string;
  home: string;
  footerLink: string;
  /** The line under «Primeros pasos» that points to this page. */
  appLine: string;
}

export function privacyPath(locale: Locale): string {
  return locale === 'en' ? '/en/privacidad' : '/privacidad';
}

const ADDRESS = 'Río Pánuco 101, Col. Vista Hermosa, C.P. 62290, Cuernavaca, Morelos, México';

export const PRIVACY_COPY: Record<Locale, PrivacyCopy> = {
  es: {
    meta: {
      title: 'Aviso de privacidad de {name}',
      description: 'Qué datos personales trata {name}, para qué, dónde se guardan, con quién no se comparten y cómo ejerces tus derechos.',
    },
    badge: 'Aviso de privacidad integral',
    draftBadge: 'Borrador en revisión',
    headline: 'Aviso de privacidad de {name}',
    lead: 'Este aviso explica qué datos personales tratamos cuando usas {name}, para qué, y cómo decides sobre ellos. Describe lo que la aplicación hace hoy.',
    versionLabel: 'Versión {version}, {date}.',
    summaryTitle: 'En breve',
    summary: [
      'Innovaciones MADFAM S.A.S. de C.V., con domicilio en Cuernavaca, Morelos, es responsable de tus datos. Contacto: privacy@madfam.io.',
      'Tratamos lo que tú capturas: tu perfil profesional, las vacantes que guardas y los documentos que preparas, además de los datos de tu cuenta.',
      'Los usamos solo para darte el servicio: guardar tu perfil, preparar tus documentos y publicarlos cuando tú lo decides. No hacemos publicidad ni perfiles comerciales, no vendemos datos y no entrenamos modelos de IA con ellos.',
      'Todo es privado hasta que tú lo publicas. Puedes descargar o borrar todos tus datos desde «Ajustes», o escribirnos.',
    ],
    pendingTitle: 'Qué falta para que este aviso sea definitivo',
    pending: {
      owner_ruling: 'La revisión y aprobación de este texto por la dirección de Innovaciones MADFAM.',
    },
    sections: [
      {
        id: 'responsable',
        title: 'Quién es responsable de tus datos',
        body: [
          `Innovaciones MADFAM S.A.S. de C.V. («MADFAM»), con domicilio en ${ADDRESS}, es responsable del tratamiento de los datos personales que captures en {name} (cv.madfam.io y sus sitios asociados).`,
          'Su departamento de protección de datos personales atiende todo lo relacionado con tus datos en privacy@madfam.io.',
        ],
      },
      {
        id: 'datos',
        title: 'Qué datos tratamos',
        body: ['Tratamos estos datos, y ninguno más:'],
        list: [
          'Datos de tu cuenta: el identificador, el nombre y el correo que entrega Janua, el servicio de identidad de MADFAM, cuando inicias sesión. Tu contraseña, si tienes una, vive en Janua; esta aplicación no la recibe.',
          'Tu perfil profesional, tal como lo escribes o lo importas: nombre para mostrar, titular, resumen, datos de contacto que decidas incluir (correo, teléfono, lugar, enlaces), experiencia, estudios, habilidades, proyectos, certificaciones, idiomas, logros, publicaciones, voluntariado y reconocimientos.',
          'Las vacantes que guardas: el texto del anuncio, su enlace, los datos que leímos de él, el estado de tu postulación y tus notas.',
          'Los documentos que preparas (CV, portafolio, presentación, carta) y si cada uno es privado, compartido por enlace o público.',
          'Datos técnicos: una cookie de sesión en la aplicación, necesaria para mantenerte dentro; y, en las páginas públicas, la dirección IP de quien las visita, usada solo en memoria para limitar el abuso, sin guardarla. Los registros del servidor anotan la ruta, el resultado y la duración de cada solicitud, no su contenido.',
        ],
      },
      {
        id: 'sensibles',
        title: 'Datos sensibles',
        body: [
          '{name} no te pide datos personales sensibles (por ejemplo, salud, origen étnico, creencias, afiliación sindical, opiniones políticas o preferencia sexual) y no los necesita. Te pedimos no incluirlos en tu perfil ni en tus documentos.',
          'Si aun así escribes alguno, se guarda como parte de tu texto y aparece en los documentos donde lo uses, incluidos los que publiques.',
        ],
      },
      {
        id: 'finalidades',
        title: 'Para qué los usamos',
        body: ['Todas estas finalidades son necesarias para darte el servicio que pides. No hay finalidades secundarias:'],
        list: [
          'Guardar tu perfil y tus vacantes, y mostrártelos solo a ti.',
          'Comparar tu perfil con el texto de una vacante, por coincidencia de palabras y sin inteligencia artificial, para ayudarte a elegir qué destacar.',
          'Preparar los documentos que pides y, solo cuando tú lo ordenas, publicarlos por enlace o en una dirección pública.',
          'Leer una vacante desde el enlace o el archivo que nos das. Cuando la lectura de imágenes está disponible y tú la aceptas, las páginas se leen en un servicio de MADFAM, en nuestra propia infraestructura, que no conserva la imagen ni el texto.',
          'Mostrarte el rango de ingreso del mercado para una vacante. Para eso enviamos a otra plataforma de MADFAM solo el título del puesto y el estado; nunca tu identidad, tu perfil ni tu CV.',
          'Proteger el servicio: límites de uso y detección de abuso.',
        ],
      },
      {
        id: 'no-hacemos',
        title: 'Lo que no hacemos',
        body: [
          'No usamos tus datos para mercadotecnia, publicidad ni perfiles comerciales. No los vendemos ni los cedemos. No entrenamos modelos de inteligencia artificial con ellos. No enviamos tu perfil a empleadores: tú decides a quién le das cada enlace. Este sitio no usa analítica ni cookies de terceros.',
        ],
      },
      {
        id: 'limitar',
        title: 'Cómo limitar el uso o la divulgación de tus datos',
        body: ['Tú controlas la divulgación desde la propia aplicación:'],
        list: [
          'Cada documento es privado hasta que lo compartes. Puedes dejar de compartirlo cuando quieras: el enlace o la dirección dejan de funcionar al instante.',
          'Un enlace compartido se puede cambiar por uno nuevo; el anterior deja de servir.',
          'Una página pública solo aparece en buscadores si marcas esa opción; viene desmarcada.',
          'Puedes editar o borrar cualquier parte de tu perfil, tus vacantes y tus documentos.',
          'También puedes pedirnos limitar un uso concreto escribiendo a privacy@madfam.io.',
        ],
      },
      {
        id: 'transferencias',
        title: 'Con quién se comparten',
        body: [
          'No transferimos tus datos a terceros. Los proveedores de infraestructura y de red con los que opera MADFAM actúan como personas encargadas: tratan los datos por cuenta de MADFAM, siguiendo sus instrucciones y bajo obligación de confidencialidad.',
          'Lo que tú publicas lo puede ver quien tenga el enlace o, si es público, cualquier persona. Esa divulgación es tu decisión y la puedes revertir.',
        ],
      },
      {
        id: 'conservacion',
        title: 'Cuánto tiempo los conservamos',
        body: [
          'Conservamos tus datos mientras tengas contenido en {name}. «Eliminar mis datos», en «Ajustes», borra en ese momento todo tu perfil, tus vacantes y tus documentos de la base de datos del servicio, y tus páginas publicadas dejan de existir.',
          'Las copias de seguridad de la plataforma, que están cifradas y solo sirven para recuperar el servicio ante una falla, pueden conservar datos ya borrados hasta por ocho semanas; después se eliminan solas.',
          'Tu cuenta de Janua no se borra desde aquí: se administra en Janua.',
        ],
      },
      {
        id: 'arco',
        title: 'Tus derechos y cómo ejercerlos',
        body: [
          'Tienes derecho a acceder a tus datos personales, rectificarlos, cancelarlos y oponerte a su tratamiento (derechos ARCO), y a revocar tu consentimiento.',
          'La forma inmediata es la propia aplicación: en tu perfil ves y corriges todo; en «Ajustes» descargas una copia completa («Descargar mis datos») o lo borras todo («Eliminar mis datos»).',
          'También puedes escribir a privacy@madfam.io. Tu solicitud debe indicar tu nombre y un medio para recibir la respuesta, acreditar tu identidad (basta escribir desde el correo con el que entras a {name}) o la de tu representante, y describir con claridad los datos y el derecho que quieres ejercer; para una rectificación, indica el cambio y acompaña lo que lo sustente.',
          'Te comunicaremos nuestra determinación en un plazo máximo de veinte días desde que recibamos tu solicitud y, si procede, la haremos efectiva dentro de los quince días siguientes. Cada plazo puede ampliarse una sola vez por un periodo igual cuando el caso lo justifique, y te lo avisaremos. El ejercicio de estos derechos es gratuito.',
          'Si no respondemos o no estás conforme con la respuesta, puedes presentar una solicitud de protección de datos ante la Secretaría Anticorrupción y Buen Gobierno, dentro de los quince días siguientes a nuestra respuesta.',
        ],
      },
      {
        id: 'cambios',
        title: 'Cambios a este aviso',
        body: [
          'Publicaremos cualquier cambio en esta misma página, con su número de versión y su fecha. Si el cambio altera qué datos tratamos o para qué, te lo avisaremos dentro de la aplicación antes de que sigas capturando datos.',
        ],
      },
    ],
    languageNote: 'El texto en español es el que rige.',
    home: 'Volver a {name}',
    footerLink: 'Aviso de privacidad',
    appLine: 'Cómo tratamos tus datos: ',
  },
  en: {
    meta: {
      title: '{name} privacy notice',
      description: 'What personal data {name} processes, what for, where it is kept, who it is not shared with, and how you exercise your rights.',
    },
    badge: 'Full privacy notice',
    draftBadge: 'Draft under review',
    headline: '{name} privacy notice',
    lead: 'This notice explains what personal data we process when you use {name}, what for, and how you decide about it. It describes what the application does today.',
    versionLabel: 'Version {version}, {date}.',
    summaryTitle: 'In short',
    summary: [
      'Innovaciones MADFAM S.A.S. de C.V., domiciled in Cuernavaca, Morelos, Mexico, is the controller of your data. Contact: privacy@madfam.io.',
      'We process what you enter: your professional profile, the job postings you save and the documents you prepare, plus your account data.',
      'We use it only to provide the service: keeping your profile, preparing your documents and publishing them when you decide to. We do no advertising or commercial profiling, we do not sell data, and we do not train AI models on it.',
      'Everything is private until you publish it. You can download or delete all your data from “Settings”, or write to us.',
    ],
    pendingTitle: 'What is missing before this notice is final',
    pending: {
      owner_ruling: 'Review and approval of this text by the management of Innovaciones MADFAM.',
    },
    sections: [
      {
        id: 'responsable',
        title: 'Who is responsible for your data',
        body: [
          `Innovaciones MADFAM S.A.S. de C.V. (“MADFAM”), domiciled at ${ADDRESS}, is the controller of the personal data you enter in {name} (cv.madfam.io and its associated sites).`,
          'Its personal data protection department handles everything about your data at privacy@madfam.io.',
        ],
      },
      {
        id: 'datos',
        title: 'What data we process',
        body: ['We process this data and no other:'],
        list: [
          'Account data: the identifier, name and email that Janua, MADFAM’s identity service, provides when you sign in. Your password, if you have one, lives in Janua; this application never receives it.',
          'Your professional profile, as you write or import it: display name, headline, summary, the contact details you choose to include (email, phone, place, links), experience, education, skills, projects, certifications, languages, achievements, publications, volunteering and awards.',
          'The job postings you save: the posting text, its link, the details we read from it, the status of your application and your notes.',
          'The documents you prepare (CV, portfolio, presentation, cover letter) and whether each is private, shared by link or public.',
          'Technical data: a session cookie in the application, needed to keep you signed in; and, on public pages, the visitor’s IP address, used only in memory to limit abuse and never stored. Server logs record the route, outcome and duration of each request, not its content.',
        ],
      },
      {
        id: 'sensibles',
        title: 'Sensitive data',
        body: [
          '{name} does not ask for sensitive personal data (for example health, ethnic origin, beliefs, union membership, political opinions or sexual orientation) and does not need it. Please do not include it in your profile or documents.',
          'If you write some anyway, it is stored as part of your text and appears in the documents where you use it, including any you publish.',
        ],
      },
      {
        id: 'finalidades',
        title: 'What we use it for',
        body: ['All of these purposes are necessary to provide the service you ask for. There are no secondary purposes:'],
        list: [
          'Keeping your profile and your job postings, and showing them only to you.',
          'Comparing your profile with a posting’s text, by keyword overlap and without artificial intelligence, to help you choose what to highlight.',
          'Preparing the documents you ask for and, only when you tell it to, publishing them by link or at a public address.',
          'Reading a posting from the link or file you give us. When reading images is available and you accept it, the pages are read by a MADFAM service on our own infrastructure, which keeps neither the image nor the text.',
          'Showing you the market income range for a posting. For that we send another MADFAM platform only the job title and the state; never your identity, your profile or your CV.',
          'Protecting the service: usage limits and abuse detection.',
        ],
      },
      {
        id: 'no-hacemos',
        title: 'What we do not do',
        body: [
          'We do not use your data for marketing, advertising or commercial profiling. We do not sell it or hand it over. We do not train artificial intelligence models on it. We do not send your profile to employers: you decide who gets each link. This site uses no analytics and no third-party cookies.',
        ],
      },
      {
        id: 'limitar',
        title: 'How to limit the use or disclosure of your data',
        body: ['You control disclosure from the application itself:'],
        list: [
          'Every document is private until you share it. You can stop sharing at any time: the link or address stops working at once.',
          'A shared link can be replaced with a new one; the old one stops working.',
          'A public page appears in search engines only if you tick that option; it is unticked by default.',
          'You can edit or delete any part of your profile, your postings and your documents.',
          'You can also ask us to limit a specific use by writing to privacy@madfam.io.',
        ],
      },
      {
        id: 'transferencias',
        title: 'Who it is shared with',
        body: [
          'We do not transfer your data to third parties. The infrastructure and network providers MADFAM operates with act as processors: they handle the data on MADFAM’s behalf, under its instructions and a duty of confidentiality.',
          'What you publish can be seen by whoever has the link or, if it is public, by anyone. That disclosure is your decision and you can reverse it.',
        ],
      },
      {
        id: 'conservacion',
        title: 'How long we keep it',
        body: [
          'We keep your data while you have content in {name}. “Delete my data”, in “Settings”, deletes your whole profile, your postings and your documents from the service’s database at that moment, and your published pages cease to exist.',
          'The platform’s backups, which are encrypted and serve only to recover the service after a failure, may keep data that has already been deleted for up to eight weeks; after that they are removed automatically.',
          'Your Janua account is not deleted from here: it is managed in Janua.',
        ],
      },
      {
        id: 'arco',
        title: 'Your rights and how to exercise them',
        body: [
          'You have the right to access your personal data, rectify it, cancel it and object to its processing (the ARCO rights under Mexican law), and to withdraw your consent.',
          'The immediate way is the application itself: in your profile you see and correct everything; in “Settings” you download a full copy (“Download my data”) or delete everything (“Delete my data”).',
          'You can also write to privacy@madfam.io. Your request must state your name and a way to receive the answer, prove your identity (writing from the email you use to sign in to {name} is enough) or your representative’s, and describe clearly the data and the right you want to exercise; for a rectification, state the change and attach what supports it.',
          'We will tell you our decision within at most twenty days of receiving your request and, if it proceeds, carry it out within the following fifteen days. Each period may be extended once, by an equal period, when the case justifies it, and we will tell you. Exercising these rights is free of charge.',
          'If we do not answer or you disagree with the answer, you may file a data protection request with Mexico’s Secretaría Anticorrupción y Buen Gobierno within fifteen days of our answer.',
        ],
      },
      {
        id: 'cambios',
        title: 'Changes to this notice',
        body: [
          'We will publish any change on this page, with its version number and date. If the change alters what data we process or what for, we will tell you inside the application before you continue entering data.',
        ],
      },
    ],
    languageNote: 'The Spanish text is the one that governs.',
    home: 'Back to {name}',
    footerLink: 'Privacy notice',
    appLine: 'How we handle your data: ',
  },
};
