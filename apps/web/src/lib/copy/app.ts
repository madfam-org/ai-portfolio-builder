/**
 * The app host's shared strings (es-MX source, en): sign-in states, navigation, page titles, the «en construcción»
 * states, data states and the labels every surface shares (item and artifact kinds, job statuses). Same truth rules as
 * copy/landing.ts (R85, R32/R36): nothing that is not built is described as working; no AI promise before W6.
 *
 * Ownership (W3 parallel PRs): THIS file belongs to W3-1 and changes only by appending. Each follow-on PR owns its
 * own file: copy/profile.ts (W3-2), copy/jobs.ts (W3-3), copy/render.ts (W3-4). The public pages host: copy/pages.ts.
 * Kind labels were reviewed against the legacy editor's es strings (tag legacy-2025-09) and rewritten in es-MX
 * sentence case; nothing else was ported.
 */
import type { AppRouteName } from '../app-routes.ts';
import type { Locale } from '../routing.ts';

export type ItemKind =
  | 'experience'
  | 'education'
  | 'skill'
  | 'project'
  | 'certification'
  | 'achievement'
  | 'language'
  | 'publication'
  | 'volunteering'
  | 'award'
  | 'link';
export type ArtifactKind = 'cv' | 'portfolio' | 'presentation' | 'cover_letter';
export type ArtifactStatus = 'draft' | 'ready' | 'published';
export type JobStatus = 'saved' | 'applying' | 'applied' | 'interview' | 'offer' | 'rejected' | 'archived';

export interface AppCopy {
  signedOutTitle: string;
  signedOutBody: string;
  signIn: string;
  signedInAs: string;
  switchAccount: string;
  otherPerson: string;
  signOut: string;
  mine: string;
  mineIntro: string;
  empty: string;
  createTitle: string;
  titleLabel: string;
  kindLabel: string;
  create: string;
  loading: string;
  failed: string;
  kinds: Record<ArtifactKind, string>;
  statuses: Record<ArtifactStatus, string>;
  /** Navigation label and page title per route. */
  routes: Record<AppRouteName, string>;
  navLabel: string;
  accountLabel: string;
  skip: string;
  /** The honest placeholder of a page whose PR has not landed yet. */
  construction: { badge: string; body: string; next: Record<AppRouteName, string> };
  homeIntro: string;
  homeCards: { name: 'profile' | 'jobs' | 'artifacts'; body: string }[];
  /** Data-layer states (lib/client/api.ts error kinds). */
  states: {
    notConfigured: string;
    notSignedIn: string;
    notFound: string;
    invalid: string;
    conflict: string;
    rateLimited: string;
    unavailable: string;
    network: string;
    error: string;
    retry: string;
    dismiss: string;
    saved: string;
  };
  itemKinds: Record<ItemKind, string>;
  jobStatuses: Record<JobStatus, string>;
}

export const APP_COPY: Record<Locale, AppCopy> = {
  es: {
    signedOutTitle: 'Inicia sesión para empezar.',
    signedOutBody: 'Tu cuenta vive en Janua, el servicio de identidad de MADFAM; esta aplicación no guarda contraseñas. La app está en una etapa temprana: algunas funciones siguen en construcción.',
    signIn: 'Iniciar sesión',
    signedInAs: 'Sesión iniciada como',
    switchAccount: 'Cambiar de cuenta',
    otherPerson: 'Entrar como otra persona',
    signOut: 'Cerrar sesión',
    mine: 'Mis documentos',
    mineIntro: 'Tus CV, portafolios y presentaciones. Por ahora, solo tú puedes verlos.',
    empty: 'Aún no tienes ninguno.',
    createTitle: 'Crear uno nuevo',
    titleLabel: 'Título',
    kindLabel: 'Tipo',
    create: 'Crear',
    loading: 'Cargando…',
    failed: 'No se pudo completar. Intenta de nuevo.',
    kinds: { cv: 'CV', portfolio: 'Portafolio', presentation: 'Presentación', cover_letter: 'Carta de presentación' },
    statuses: { draft: 'Borrador', ready: 'Listo', published: 'Publicado' },
    routes: {
      home: 'Inicio',
      profile: 'Perfil',
      jobs: 'Empleos',
      job: 'Empleo',
      jobTailor: 'Adaptar al empleo',
      artifacts: 'Documentos',
      artifact: 'Documento',
      artifactPreview: 'Vista previa',
      artifactPrint: 'Imprimir',
      settings: 'Ajustes',
    },
    navLabel: 'Secciones de la app',
    accountLabel: 'Cuenta',
    skip: 'Saltar al contenido',
    construction: {
      badge: 'En construcción',
      body: 'Esta sección todavía no está lista. No hay datos de ejemplo: cuando esté lista, aquí verás solo lo que tú captures.',
      next: {
        home: 'Desde aquí llegarás a tu perfil, tus empleos y tus documentos.',
        profile: 'Aquí capturarás una sola vez tu experiencia, estudios, proyectos, habilidades e idiomas.',
        jobs: 'Aquí guardarás el texto de cada vacante y el estado de cada postulación.',
        job: 'Aquí verás una vacante, tus notas y los documentos que prepares para ella.',
        jobTailor: 'Aquí compararás tu perfil con la vacante por palabras clave (sin IA) y elegirás qué destacar.',
        artifacts: 'Aquí estarán tus CV, portafolios, presentaciones y cartas.',
        artifact: 'Aquí editarás un documento y decidirás si lo compartes con un enlace o lo publicas.',
        artifactPreview: 'Aquí verás el documento tal como lo verá quien lo abra.',
        artifactPrint: 'Aquí estará la versión para imprimir o guardar como PDF desde tu navegador.',
        settings: 'Aquí estarán los ajustes de tu cuenta y de tus datos.',
      },
    },
    homeIntro: 'Tu perfil, los empleos a los que te postulas y los documentos que preparas para cada uno.',
    homeCards: [
      { name: 'profile', body: 'Tu trayectoria, una sola vez.' },
      { name: 'jobs', body: 'Las vacantes que te interesan y en qué va cada postulación.' },
      { name: 'artifacts', body: 'CV, portafolios y presentaciones a la medida de cada empleo.' },
    ],
    states: {
      notConfigured: 'Este servicio todavía no está configurado. Vuelve más tarde.',
      notSignedIn: 'Tu sesión terminó. Inicia sesión de nuevo.',
      notFound: 'No encontramos lo que buscas.',
      invalid: 'Revisa los campos marcados.',
      conflict: 'No se pudo guardar por un conflicto con otro dato.',
      rateLimited: 'Llegaste al límite por ahora. Intenta más tarde.',
      unavailable: 'El servicio no responde en este momento. Intenta en unos minutos.',
      network: 'Sin conexión. Revisa tu red e intenta de nuevo.',
      error: 'Algo salió mal. Intenta de nuevo.',
      retry: 'Reintentar',
      dismiss: 'Cerrar',
      saved: 'Guardado',
    },
    itemKinds: {
      experience: 'Experiencia',
      education: 'Educación',
      skill: 'Habilidades',
      project: 'Proyectos',
      certification: 'Certificaciones',
      achievement: 'Logros',
      language: 'Idiomas',
      publication: 'Publicaciones',
      volunteering: 'Voluntariado',
      award: 'Reconocimientos',
      link: 'Enlaces',
    },
    jobStatuses: {
      saved: 'Guardado',
      applying: 'Preparando postulación',
      applied: 'Postulado',
      interview: 'Entrevista',
      offer: 'Oferta',
      rejected: 'No seleccionado',
      archived: 'Archivado',
    },
  },
  en: {
    signedOutTitle: 'Sign in to get started.',
    signedOutBody: 'Your account lives in Janua, MADFAM’s identity service; this application stores no passwords. The app is at an early stage: some features are still being built.',
    signIn: 'Sign in',
    signedInAs: 'Signed in as',
    switchAccount: 'Switch account',
    otherPerson: 'Sign in as someone else',
    signOut: 'Sign out',
    mine: 'My documents',
    mineIntro: 'Your CVs, portfolios and presentations. For now, only you can see them.',
    empty: 'You have none yet.',
    createTitle: 'Create a new one',
    titleLabel: 'Title',
    kindLabel: 'Type',
    create: 'Create',
    loading: 'Loading…',
    failed: 'That did not work. Please try again.',
    kinds: { cv: 'CV', portfolio: 'Portfolio', presentation: 'Presentation', cover_letter: 'Cover letter' },
    statuses: { draft: 'Draft', ready: 'Ready', published: 'Published' },
    routes: {
      home: 'Home',
      profile: 'Profile',
      jobs: 'Jobs',
      job: 'Job',
      jobTailor: 'Tailor to the job',
      artifacts: 'Documents',
      artifact: 'Document',
      artifactPreview: 'Preview',
      artifactPrint: 'Print',
      settings: 'Settings',
    },
    navLabel: 'App sections',
    accountLabel: 'Account',
    skip: 'Skip to content',
    construction: {
      badge: 'Under construction',
      body: 'This section is not ready yet. There is no sample data: once it is ready, you will see only what you enter here.',
      next: {
        home: 'From here you will reach your profile, your jobs and your documents.',
        profile: 'Here you will enter, once, your experience, education, projects, skills and languages.',
        jobs: 'Here you will save the text of each job posting and the status of each application.',
        job: 'Here you will see one job, your notes and the documents you prepare for it.',
        jobTailor: 'Here you will compare your profile with the posting by keywords (no AI) and choose what to highlight.',
        artifacts: 'Here you will find your CVs, portfolios, presentations and letters.',
        artifact: 'Here you will edit a document and decide whether to share it with a link or publish it.',
        artifactPreview: 'Here you will see the document as the people you share it with will see it.',
        artifactPrint: 'Here you will find the version to print or save as PDF from your browser.',
        settings: 'Here you will find the settings of your account and your data.',
      },
    },
    homeIntro: 'Your profile, the jobs you apply to and the documents you prepare for each of them.',
    homeCards: [
      { name: 'profile', body: 'Your career, entered once.' },
      { name: 'jobs', body: 'The jobs you are interested in and where each application stands.' },
      { name: 'artifacts', body: 'CVs, portfolios and presentations tailored to each job.' },
    ],
    states: {
      notConfigured: 'This service is not configured yet. Please come back later.',
      notSignedIn: 'Your session ended. Please sign in again.',
      notFound: 'We could not find what you are looking for.',
      invalid: 'Please check the highlighted fields.',
      conflict: 'It could not be saved because it conflicts with other data.',
      rateLimited: 'You reached the limit for now. Please try later.',
      unavailable: 'The service is not answering right now. Please try again in a few minutes.',
      network: 'You are offline. Check your connection and try again.',
      error: 'Something went wrong. Please try again.',
      retry: 'Try again',
      dismiss: 'Close',
      saved: 'Saved',
    },
    itemKinds: {
      experience: 'Experience',
      education: 'Education',
      skill: 'Skills',
      project: 'Projects',
      certification: 'Certifications',
      achievement: 'Achievements',
      language: 'Languages',
      publication: 'Publications',
      volunteering: 'Volunteering',
      award: 'Awards',
      link: 'Links',
    },
    jobStatuses: {
      saved: 'Saved',
      applying: 'Preparing the application',
      applied: 'Applied',
      interview: 'Interview',
      offer: 'Offer',
      rejected: 'Not selected',
      archived: 'Archived',
    },
  },
};
