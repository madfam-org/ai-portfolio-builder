import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { ProfileEditor } from '@/components/profile/ProfileEditor';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'profile');
}

/**
 * `/perfil` (`/en/perfil`): the core profile editor (W3-2). The frame decides the honest state (dormant, signed out,
 * signed in); signed in, the editor loads the person's own profile through the same-origin data layer. The display
 * name is prefilled from the Janua `name` claim the session carries, until the person saves their own.
 */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return <AppFrame locale={locale} route="profile">{(person) => <ProfileEditor locale={locale} nameHint={person.name} />}</AppFrame>;
}
