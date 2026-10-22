import { apiErrorMessage } from '@/lib/client/api';
import { APP_COPY } from '@/lib/copy/app';
import { INGEST_COPY } from '@/lib/copy/ingest';
import { fmt } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import type { IntakeOutcome } from './client';

/** The honest message for a failed intake call (copy/ingest.ts), with the board or HTTP status filled in. */
export function intakeFailureMessage(locale: Locale, out: Extract<IntakeOutcome, { ok: false }>): string {
  const t = INGEST_COPY[locale];
  if (out.code === 'quota_exceeded') return t.quota;
  if (out.code === 'rate_limited') return t.rateLimited(out.retryAfter ?? 60);
  if (out.reason) return fmt(t.failures[out.reason], { board: out.board ?? '', status: out.status ?? '' });
  return apiErrorMessage({ kind: out.kind, status: out.status ?? 0, code: out.code }, APP_COPY[locale].states);
}

