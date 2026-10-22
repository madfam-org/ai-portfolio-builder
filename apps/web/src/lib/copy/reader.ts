/**
 * W6-A: the public page about cv's job-link reader (`/lector`, `/en/lector` on the landing host), es-MX source and en.
 * Its URL is in the reader's User-Agent (server/ingest/fetcher.ts INTAKE_USER_AGENT), so a site operator who sees
 * the reader in a log lands here. Every statement describes code that exists (R85): server/ingest/{fetcher,robots,
 * intake,boards,ats,rate-limit}.ts and docs/PRODUCT.md "Job intake". `{name}` renders PRODUCT_LABEL.
 */
import type { Locale } from '../routing.ts';

export interface ReaderSection {
  id: string;
  title: string;
  /** Paragraphs before the list. */
  body: string[];
  list?: string[];
}

export interface ReaderCopy {
  meta: { title: string; description: string };
  badge: string;
  headline: string;
  lead: string;
  identity: { title: string; uaLabel: string; tokenLabel: string; note: string };
  sections: ReaderSection[];
  optOut: { title: string; body: string; example: string; partial: string; contactTitle: string; contact: string };
  home: string;
  /** The footer link to this page. */
  footerLink: string;
}

const ATS = 'Greenhouse, Lever, SmartRecruiters, Ashby, Workable, Recruitee, Pinpoint';
const BOARDS = 'LinkedIn, Indeed, Google, Glassdoor, Talent.com, Computrabajo';

export const READER_COPY: Record<Locale, ReaderCopy> = {
  es: {
    meta: {
      title: 'El lector de vacantes de {name}',
      description:
        'Qué lee el lector de vacantes de {name}, cuándo y con qué límites; qué nunca hace, y cómo un sitio puede pedir que no lo lea (robots.txt, madfam-cv).',
    },
    badge: 'Para quienes operan sitios web',
    headline: 'El lector de vacantes de {name}',
    lead: 'Si viste «MADFAM-CV-Intake» en los registros de tu sitio, esta página explica qué es. No es un rastreador: lee una sola vacante cuando una persona con sesión iniciada en {name} pega su enlace y pide leerla.',
    identity: {
      title: 'Cómo identificarlo',
      uaLabel: 'User-Agent',
      tokenLabel: 'Nombre en robots.txt',
      note: 'No publicamos una lista fija de direcciones IP; identifícalo por su User-Agent y por el nombre madfam-cv.',
    },
    sections: [
      {
        id: 'que-lee',
        title: 'Qué lee y cuándo',
        body: [
          'Sólo cuando una persona con sesión iniciada pega el enlace de una vacante y pide leerla. Nunca de forma programada, nunca al mostrar una página y nunca a partir de enlaces que encuentre.',
          'Con cada solicitud hace, como máximo:',
        ],
        list: [
          'una lectura de robots.txt del sitio (la respuesta se guarda una hora por sitio);',
          `una lectura de la API pública y documentada del sistema de reclutamiento, si el enlace es de uno que la tiene (${ATS}); si esa lectura falla, lee la página;`,
          'una lectura de la página de la vacante: sólo el documento HTML, sin imágenes, hojas de estilo ni scripts, y sin ejecutar JavaScript.',
        ],
      },
      {
        id: 'limites',
        title: 'Con qué límites',
        body: ['Cada lectura tiene límites fijos en el código:'],
        list: [
          'sólo HTTPS, en el puerto 443;',
          'como máximo 3 redirecciones, y cada una se vuelve a revisar;',
          '2 MB por respuesta y 8 segundos para toda la lectura;',
          'por persona y por servidor, como máximo 20 enlaces cada 10 minutos y 100 al día.',
        ],
      },
      {
        id: 'nunca',
        title: 'Lo que nunca hace',
        body: [],
        list: [
          'No rastrea: no sigue los enlaces de la página ni lee otras páginas del sitio.',
          'No inicia sesión ni envía cookies, contraseñas o credenciales; ignora las cookies que reciba.',
          'No evade bloqueos: no cambia su User-Agent, no rota direcciones y no resuelve CAPTCHAs. Si el sitio responde 401, 403, 429 o 451, no reintenta: le dice a la persona que el sitio bloqueó la lectura automática.',
          'Respeta robots.txt: lo lee antes de la página y obedece el grupo «madfam-cv» o, si no existe, el grupo «*». Si robots.txt responde con un error del servidor o no se puede leer, no lee la página.',
          `No lee sitios cuyas condiciones prohíben la lectura desde un servidor (${BOARDS}); ahí la persona copia la vacante desde su propio navegador.`,
          'No usa IA para leer la vacante ni guarda la página: arma una vista previa que la persona revisa, y sólo se guarda en su cuenta si ella decide guardarla.',
          'Sus registros guardan el nombre del sitio y el resultado, nunca la dirección completa de la página.',
        ],
      },
    ],
    optOut: {
      title: 'Cómo pedir que no lea tu sitio',
      body: 'Agrega este grupo a tu robots.txt:',
      example: 'User-agent: madfam-cv\nDisallow: /',
      partial: 'También puedes bloquear sólo algunas rutas (por ejemplo, «Disallow: /empleos»). La regla vale a más tardar una hora después, cuando vence la copia guardada de tu robots.txt.',
      contactTitle: 'Contacto',
      contact: 'Para dudas, problemas o para pedir que no se lea la API pública de tu sistema de reclutamiento, escribe a support@madfam.io.',
    },
    home: 'Conoce {name}',
    footerLink: 'Lector de vacantes',
  },
  en: {
    meta: {
      title: 'The {name} job-link reader',
      description:
        'What the {name} job-link reader fetches, when and within which limits; what it never does, and how a site can ask it not to read it (robots.txt, madfam-cv).',
    },
    badge: 'For website operators',
    headline: 'The {name} job-link reader',
    lead: 'If you saw “MADFAM-CV-Intake” in your site’s logs, this page explains it. It is not a crawler: it reads one job posting when a person signed in to {name} pastes its link and asks to read it.',
    identity: {
      title: 'How to identify it',
      uaLabel: 'User-Agent',
      tokenLabel: 'robots.txt name',
      note: 'We do not publish a fixed list of IP addresses; identify it by its User-Agent and by the name madfam-cv.',
    },
    sections: [
      {
        id: 'what',
        title: 'What it reads, and when',
        body: [
          'Only when a signed-in person pastes the link of a job posting and asks to read it. Never on a schedule, never when a page is displayed and never from links it finds.',
          'For each request it makes, at most:',
        ],
        list: [
          'one read of the site’s robots.txt (the answer is kept for an hour per site);',
          `one read of the recruiting system’s documented public API, when the link belongs to one that has it (${ATS}); if that read fails, it reads the page;`,
          'one read of the job page: the HTML document only, no images, stylesheets or scripts, and no JavaScript is run.',
        ],
      },
      {
        id: 'limits',
        title: 'Within which limits',
        body: ['Every read has fixed limits in the code:'],
        list: [
          'HTTPS only, on port 443;',
          'at most 3 redirects, each one checked again;',
          '2 MB per response and 8 seconds for the whole read;',
          'per person and per server, at most 20 links every 10 minutes and 100 a day.',
        ],
      },
      {
        id: 'never',
        title: 'What it never does',
        body: [],
        list: [
          'It does not crawl: it never follows the page’s links or reads other pages of the site.',
          'It never signs in or sends cookies, passwords or credentials; it ignores any cookie it receives.',
          'It does not evade blocks: it never changes its User-Agent, rotates addresses or solves CAPTCHAs. If the site answers 401, 403, 429 or 451 it does not retry: it tells the person the site blocked automatic reading.',
          'It respects robots.txt: it reads it before the page and follows the “madfam-cv” group or, when there is none, the “*” group. If robots.txt answers with a server error or cannot be read, it does not read the page.',
          `It does not read sites whose terms forbid reading from a server (${BOARDS}); there the person copies the posting from their own browser.`,
          'It uses no AI to read the posting and does not keep the page: it builds a preview the person reviews, and it is stored in their account only if they choose to save it.',
          'Its logs keep the site’s name and the outcome, never the page’s full address.',
        ],
      },
    ],
    optOut: {
      title: 'How to ask it not to read your site',
      body: 'Add this group to your robots.txt:',
      example: 'User-agent: madfam-cv\nDisallow: /',
      partial: 'You can also block only some paths (for example, “Disallow: /jobs”). The rule applies within an hour at most, when the kept copy of your robots.txt expires.',
      contactTitle: 'Contact',
      contact: 'For questions, problems or to ask that your recruiting system’s public API not be read, write to support@madfam.io.',
    },
    home: 'About {name}',
    footerLink: 'Job-link reader',
  },
};

/** The page's path on the landing host. */
export function readerPath(locale: Locale): string {
  return locale === 'en' ? '/en/lector' : '/lector';
}
