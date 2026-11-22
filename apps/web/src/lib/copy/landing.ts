/**
 * Every visible string, es-MX (the source) and en. Truth rules for this copy (R85, R29, R32/R36, R57):
 * no users, metrics, logos or testimonials; anything not built says so; what invited people can already use says
 * «beta privada» (invite-only, owner ruling 2026-10-22) and nothing more; the incubating CTA is a waitlist;
 * no licence named by hand. `{name}` renders PRODUCT_LABEL.
 */
import type { Locale } from '../routing.ts';

export interface Item {
  title: string;
  body: string;
  tag: string;
  /** True when it is already the case today (not a plan). */
  live?: boolean;
}

export interface Copy {
  htmlLang: string;
  meta: { title: string; description: string; appTitle: string };
  skip: string;
  badge: string;
  headline: string;
  lead: string;
  cta: string;
  ctaSubject: string;
  ctaNote: string;
  buildingTitle: string;
  buildingIntro: string;
  building: Item[];
  ecosystemTitle: string;
  ecosystemIntro: string;
  ecosystem: Item[];
  statusTitle: string;
  status: string;
  app: { badge: string; headline: string; body: string; back: string };
  footer: {
    builtBy: string;
    privacy: string;
    terms: string;
    cookies: string;
    open: string;
    switchLabel: string;
    switchTo: string;
  };
  notFound: { title: string; body: string; home: string };
}

const soon = { es: 'Próximamente', en: 'Coming soon' };
const today = { es: 'Hoy', en: 'Today' };
/** Built and in use by invited people only (the beta is invite-only; the gate lives in Janua). */
const beta = { es: 'En beta privada', en: 'In private beta' };

export const COPY: Record<Locale, Copy> = {
  es: {
    htmlLang: 'es-MX',
    meta: {
      title: '{name}: un perfil, un CV a la medida de cada vacante (beta privada)',
      description:
        'Un constructor de CV y portafolios que Innovaciones MADFAM está desarrollando: capturas tu perfil una vez y, para cada vacante, preparas un CV, un portafolio y una presentación a la medida, que tú revisas y publicas. Beta privada por invitación; lista de espera abierta.',
      appTitle: '{name}: la app todavía no está abierta',
    },
    skip: 'Saltar al contenido',
    badge: 'Beta privada · por invitación',
    headline: 'Un solo perfil. Un CV, un portafolio y una presentación a la medida de cada vacante.',
    lead: 'Capturas tu trayectoria una sola vez —experiencia, estudios, proyectos y habilidades— y, para cada vacante a la que te postulas, preparas un CV, un portafolio y una presentación a la medida, que tú revisas, editas y publicas. {name} está en beta privada: por ahora se entra solo con invitación.',
    cta: 'Unirme a la lista de espera',
    ctaSubject: 'Lista de espera: {name}',
    ctaNote:
      'El botón abre tu correo con un mensaje para hola@madfam.io. Esta página no tiene formularios, cookies ni analítica.',
    buildingTitle: 'Lo que ya hace y lo que falta',
    buildingIntro: 'Lo marcado «En beta privada» ya funciona para las personas invitadas. Lo marcado «Próximamente» todavía no existe.',
    building: [
      {
        title: 'Un perfil central',
        body: 'Tu experiencia, estudios, proyectos y habilidades en un solo lugar, para no reescribirlos en cada postulación.',
        tag: beta.es,
        live: true,
      },
      {
        title: 'Tus vacantes, una por una',
        body: 'Guarda el texto de cada vacante que te interesa y lleva el seguimiento de tus postulaciones.',
        tag: beta.es,
        live: true,
      },
      {
        title: 'Un CV, un portafolio y una presentación por vacante',
        body: 'Para cada vacante preparas versiones a la medida que destacan lo que esa vacante pide. Compártelas con un enlace privado o publícalas; nada se publica sin tu aprobación.',
        tag: beta.es,
        live: true,
      },
      {
        title: 'Discreción por defecto',
        body: 'Nada de lo que preparas se ve hasta que tú lo publicas, tus datos de contacto quedan fuera salvo que decidas incluirlos, y puedes retirar un enlace cuando quieras.',
        tag: beta.es,
        live: true,
      },
      {
        title: 'Redacción asistida, con tu revisión',
        body: 'La IA propondrá textos a partir de tu perfil y de cada vacante, y tú decides qué se queda.',
        tag: soon.es,
      },
      {
        title: 'Tu información, bajo tu control',
        body: 'Desde la propia app puedes editar, descargar o borrar todo lo que captures.',
        tag: beta.es,
        live: true,
      },
    ],
    ecosystemTitle: 'Hecho sobre el ecosistema MADFAM',
    ecosystemIntro: '{name} usa lo que el ecosistema de MADFAM ya resuelve, en lugar de reinventarlo.',
    ecosystem: [
      {
        title: 'Inicio de sesión con Janua',
        body: 'Janua es el servicio de identidad de MADFAM. Tu cuenta vive ahí; esta aplicación no guarda contraseñas.',
        tag: today.es,
        live: true,
      },
      {
        title: 'Infraestructura que opera MADFAM',
        body: 'Este sitio ya corre en infraestructura que opera MADFAM, la misma que usan sus otras plataformas.',
        tag: today.es,
        live: true,
      },
      {
        title: 'Construido en abierto',
        body: 'El código de {name} es público: puedes leer cómo funciona y seguir su avance.',
        tag: today.es,
        live: true,
      },
    ],
    statusTitle: 'Estado',
    status:
      'Beta privada, solo por invitación. Todavía no hay registro abierto, precios ni fecha de lanzamiento. Si te anotas en la lista de espera, te escribiremos cuando haya novedades.',
    app: {
      badge: 'Beta privada · por invitación',
      headline: 'La app todavía no está abierta.',
      body: 'Estamos construyendo {name}. El inicio de sesión con Janua aún no está disponible: llegará próximamente. Por ahora no hay cuentas y aquí no se guarda ningún dato.',
      back: 'Conoce el proyecto',
    },
    footer: {
      builtBy: 'Hecho por Innovaciones MADFAM',
      privacy: 'Aviso de privacidad',
      terms: 'Términos',
      cookies: 'Cookies',
      open: 'Construido en abierto',
      switchLabel: 'Idioma',
      switchTo: 'English',
    },
    notFound: { title: 'Página no encontrada', body: 'Esta dirección no existe.', home: 'Ir al inicio' },
  },
  en: {
    htmlLang: 'en',
    meta: {
      title: '{name}: one profile, a CV tailored to every job (private beta)',
      description:
        'A CV and portfolio builder in development by Innovaciones MADFAM: you enter your profile once and, for every job, prepare a tailored CV, portfolio and presentation that you review and publish. Invite-only private beta; waitlist open.',
      appTitle: '{name}: the app is not open yet',
    },
    skip: 'Skip to content',
    badge: 'Private beta · invite only',
    headline: 'One profile. A tailored CV, portfolio and presentation for every job you apply to.',
    lead: 'You enter your career once —experience, education, projects and skills— and, for every job you apply to, you prepare a tailored CV, portfolio and presentation that you review, edit and publish. {name} is in private beta: for now, access is by invitation only.',
    cta: 'Join the waitlist',
    ctaSubject: 'Waitlist: {name}',
    ctaNote: 'The button opens your email with a message to hola@madfam.io. This page has no forms, cookies or analytics.',
    buildingTitle: 'What it does today and what is missing',
    buildingIntro: 'Items marked “In private beta” already work for invited people. Items marked “Coming soon” do not exist yet.',
    building: [
      {
        title: 'One core profile',
        body: 'Your experience, education, projects and skills in one place, so you never rewrite them for each application.',
        tag: beta.en,
        live: true,
      },
      {
        title: 'Your jobs, one by one',
        body: 'Save the text of each job you are interested in and keep track of your applications.',
        tag: beta.en,
        live: true,
      },
      {
        title: 'A CV, a portfolio and a presentation per job',
        body: 'For each job you prepare tailored versions that highlight what that job asks for. Share them with a private link or publish them; nothing is published without your approval.',
        tag: beta.en,
        live: true,
      },
      {
        title: 'Discreet by default',
        body: 'Nothing you prepare can be seen until you publish it, your contact details stay out unless you choose to include them, and you can withdraw a link whenever you want.',
        tag: beta.en,
        live: true,
      },
      {
        title: 'Assisted writing, with your review',
        body: 'The AI will suggest text from your profile and each job, and you decide what stays.',
        tag: soon.en,
      },
      {
        title: 'Your information, under your control',
        body: 'From the app itself you can edit, download or delete everything you enter.',
        tag: beta.en,
        live: true,
      },
    ],
    ecosystemTitle: 'Built on the MADFAM ecosystem',
    ecosystemIntro: '{name} uses what the MADFAM ecosystem already solves instead of reinventing it.',
    ecosystem: [
      {
        title: 'Sign in with Janua',
        body: 'Janua is MADFAM’s identity service. Your account lives there; this application does not store passwords.',
        tag: today.en,
        live: true,
      },
      {
        title: 'Infrastructure MADFAM operates',
        body: 'This site already runs on infrastructure that MADFAM operates, the same that runs its other platforms.',
        tag: today.en,
        live: true,
      },
      {
        title: 'Built in the open',
        body: 'The {name} code is public: you can read how it works and follow its progress.',
        tag: today.en,
        live: true,
      },
    ],
    statusTitle: 'Status',
    status:
      'Private beta, by invitation only. There is no open sign-up, price or launch date yet. If you join the waitlist, we will write to you when there is news.',
    app: {
      badge: 'Private beta · invite only',
      headline: 'The app is not open yet.',
      body: 'We are building {name}. Sign-in with Janua is not available yet: it is coming soon. For now there are no accounts and no data is stored here.',
      back: 'About the project',
    },
    footer: {
      builtBy: 'Built by Innovaciones MADFAM',
      privacy: 'Privacy notice',
      terms: 'Terms',
      cookies: 'Cookies',
      open: 'Built in the open',
      switchLabel: 'Language',
      switchTo: 'Español',
    },
    notFound: { title: 'Page not found', body: 'This address does not exist.', home: 'Go to the home page' },
  },
};

/** Fills `{name}` with the product label. */
export function fill(text: string, name: string): string {
  return text.split('{name}').join(name);
}

export function isLocale(value: string): value is Locale {
  return value === 'es' || value === 'en';
}
