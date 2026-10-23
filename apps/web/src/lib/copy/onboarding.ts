/**
 * The first-run guide on the app home (B1, beta readiness 2026-10-22): what a signed-in person with an empty profile
 * does first. es-MX is the source; `tú`, like the rest of the app. Truth rules as copy/app.ts (R85): every step names
 * something that is built today (W4-I import, the profile editor, W5-J job intake) and the privacy line states the
 * product's actual default (everything owner-scoped; documents private until their owner publishes them).
 * Owned by lane B1; append-only for others.
 */
import type { Locale } from '../routing.ts';

export interface OnboardingCopy {
  title: string;
  intro: string;
  profileStep: { title: string; body: string; importCta: string; manualCta: string };
  jobStep: { title: string; body: string; cta: string };
  privacy: string;
}

export const ONBOARDING_COPY: Readonly<Record<Locale, OnboardingCopy>> = {
  es: {
    title: 'Primeros pasos',
    intro: 'Tu perfil todavía está vacío. Empieza así:',
    profileStep: {
      title: 'Arma tu perfil',
      body: 'Importa el ZIP de datos que te da LinkedIn o un archivo JSON Resume: se lee en tu navegador y revisas todo antes de guardar. O empieza a mano, sección por sección.',
      importCta: 'Importar LinkedIn o JSON Resume',
      manualCta: 'Empezar a mano',
    },
    jobStep: {
      title: 'Guarda la primera vacante que te interesa',
      body: 'Pega el enlace, usa el marcador «Capturar vacante» de tu navegador, sube el PDF o pega el texto de la publicación. Desde esa vacante preparas tus documentos para postularte.',
      cta: 'Agregar una vacante',
    },
    privacy: 'Todo lo que guardas aquí es privado. Nada se publica a menos que tú lo decidas.',
  },
  en: {
    title: 'First steps',
    intro: 'Your profile is still empty. Start here:',
    profileStep: {
      title: 'Build your profile',
      body: 'Import the data ZIP LinkedIn gives you or a JSON Resume file: it is read in your browser and you review everything before saving. Or start by hand, one section at a time.',
      importCta: 'Import LinkedIn or JSON Resume',
      manualCta: 'Start by hand',
    },
    jobStep: {
      title: 'Save the first job you are aiming for',
      body: 'Paste the link, use the «Capture posting» bookmark in your browser, upload the PDF or paste the text of the posting. From that job you prepare your application documents.',
      cta: 'Add a job',
    },
    privacy: 'Everything you save here is private. Nothing is published unless you choose to publish it.',
  },
};
