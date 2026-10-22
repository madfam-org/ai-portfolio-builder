import { loadConfig, type Config } from '../src/lib/config.ts';

/** A configuration with the production host defaults and the given overrides. */
export function cfg(env: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: 'production', ...env });
}
