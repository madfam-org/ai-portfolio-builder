/** App-shell strings for the sign-in states (es-MX source, en). Same truth rules as copy.ts. */
import type { Locale } from './routing.ts';

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
  kinds: Record<'cv' | 'portfolio' | 'presentation' | 'cover_letter', string>;
  statuses: Record<'draft' | 'ready' | 'published', string>;
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
    mine: 'Mis portafolios',
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
  },
  en: {
    signedOutTitle: 'Sign in to get started.',
    signedOutBody: 'Your account lives in Janua, MADFAM’s identity service; this application stores no passwords. The app is at an early stage: some features are still being built.',
    signIn: 'Sign in',
    signedInAs: 'Signed in as',
    switchAccount: 'Switch account',
    otherPerson: 'Sign in as someone else',
    signOut: 'Sign out',
    mine: 'My portfolios',
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
  },
};
