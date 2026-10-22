/**
 * Every visible string, es-MX (the source) and en. Truth rules for this copy (R85, R29, R32/R36, R57):
 * no users, metrics, logos or testimonials; anything not built says so; the incubating CTA is a waitlist;
 * no licence named by hand. `{name}` renders PRODUCT_LABEL.
 */
import type { Locale } from './routing.ts';

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
  source: string;
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

export const COPY: Record<Locale, Copy> = {
  es: {
    htmlLang: 'es-MX',
    meta: {
      title: '{name}: tu trayectoria, convertida en portafolio (próximamente)',
      description:
        'Un constructor de portafolios asistido por IA que Innovaciones MADFAM está desarrollando: partirá de tu CV, LinkedIn o GitHub para armar un sitio que tú revisas y publicas. Lista de espera abierta.',
      appTitle: '{name}: la app todavía no está abierta',
    },
    skip: 'Saltar al contenido',
    badge: 'En incubación · próximamente',
    headline: 'Tu trayectoria, convertida en un portafolio que puedes publicar.',
    lead: 'Estamos construyendo {name}, un constructor de portafolios asistido por IA. Partirá de lo que ya tienes —tu CV, tu perfil de LinkedIn o tu GitHub— y te ayudará a armar un sitio de portafolio que tú revisas, editas y publicas.',
    cta: 'Unirme a la lista de espera',
    ctaSubject: 'Lista de espera: {name}',
    ctaNote:
      'El botón abre tu correo con un mensaje para hola@madfam.io. Este sitio no tiene formularios, cookies ni analítica.',
    source: 'Ver el código',
    buildingTitle: 'Lo que estamos construyendo',
    buildingIntro: 'Nada de esto está disponible todavía. Así lo estamos diseñando:',
    building: [
      {
        title: 'Importa lo que ya tienes',
        body: 'Sube tu CV o conecta tu LinkedIn o tu GitHub para no empezar desde cero.',
        tag: soon.es,
      },
      {
        title: 'Redacción asistida, con tu revisión',
        body: 'La IA propone textos a partir de tu experiencia y tú decides qué se queda. Nada se publica sin tu aprobación.',
        tag: soon.es,
      },
      {
        title: 'Un portafolio que puedes compartir',
        body: 'Publica tu sitio en una dirección propia y actualízalo cuando cambie tu trayectoria.',
        tag: soon.es,
      },
      {
        title: 'Tu información, bajo tu control',
        body: 'Lo diseñamos para que puedas editar, exportar o borrar lo que subas.',
        tag: soon.es,
      },
    ],
    ecosystemTitle: 'Hecho sobre el ecosistema MADFAM',
    ecosystemIntro: '{name} usa lo que el ecosistema de MADFAM ya resuelve, en lugar de reinventarlo.',
    ecosystem: [
      {
        title: 'Inicio de sesión con Janua',
        body: 'Janua es el servicio de identidad de MADFAM. Tu cuenta vivirá ahí; esta aplicación no guardará contraseñas.',
        tag: soon.es,
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
      'En incubación. Todavía no hay cuentas, precios ni fecha de lanzamiento. Si te anotas en la lista de espera, te escribiremos cuando haya novedades.',
    app: {
      badge: 'Antes del lanzamiento',
      headline: 'La app todavía no está abierta.',
      body: 'Estamos construyendo {name}. El inicio de sesión con Janua llegará próximamente; por ahora no hay cuentas y aquí no se guarda ningún dato.',
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
      title: '{name}: your career, turned into a portfolio (coming soon)',
      description:
        'An AI-assisted portfolio builder in development by Innovaciones MADFAM: it will start from your CV, LinkedIn or GitHub to build a site you review and publish. Waitlist open.',
      appTitle: '{name}: the app is not open yet',
    },
    skip: 'Skip to content',
    badge: 'Incubating · coming soon',
    headline: 'Your career, turned into a portfolio you can publish.',
    lead: 'We are building {name}, an AI-assisted portfolio builder. It will start from what you already have —your CV, your LinkedIn profile or your GitHub— and help you put together a portfolio site that you review, edit and publish.',
    cta: 'Join the waitlist',
    ctaSubject: 'Waitlist: {name}',
    ctaNote: 'The button opens your email with a message to hola@madfam.io. This site has no forms, cookies or analytics.',
    source: 'View the code',
    buildingTitle: 'What we are building',
    buildingIntro: 'None of this is available yet. This is how we are designing it:',
    building: [
      {
        title: 'Import what you already have',
        body: 'Upload your CV or connect your LinkedIn or GitHub so you never start from scratch.',
        tag: soon.en,
      },
      {
        title: 'Assisted writing, with your review',
        body: 'The AI suggests text from your experience and you decide what stays. Nothing is published without your approval.',
        tag: soon.en,
      },
      {
        title: 'A portfolio you can share',
        body: 'Publish your site at an address of your own and update it as your career changes.',
        tag: soon.en,
      },
      {
        title: 'Your information, under your control',
        body: 'We are designing it so you can edit, export or delete whatever you upload.',
        tag: soon.en,
      },
    ],
    ecosystemTitle: 'Built on the MADFAM ecosystem',
    ecosystemIntro: '{name} uses what the MADFAM ecosystem already solves instead of reinventing it.',
    ecosystem: [
      {
        title: 'Sign in with Janua',
        body: 'Janua is MADFAM’s identity service. Your account will live there; this application will not store passwords.',
        tag: soon.en,
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
      'Incubating. There are no accounts, prices or launch date yet. If you join the waitlist, we will write to you when there is news.',
    app: {
      badge: 'Pre-launch',
      headline: 'The app is not open yet.',
      body: 'We are building {name}. Sign-in with Janua is coming soon; for now there are no accounts and no data is stored here.',
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
