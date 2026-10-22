import { loadConfig } from './config.ts';

/** Validates the environment once at server start; exits non-zero with the reason when it is invalid. */
export function validateOrExit(): void {
  try {
    const config = loadConfig(process.env);
    const hosts = Object.entries(config.hosts)
      .map(([role, host]) => `${role}=${host}`)
      .join(' ');
    console.warn(`cv: serving ${hosts} indexable=${config.indexable} revision=${config.revision ?? 'unset'}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
