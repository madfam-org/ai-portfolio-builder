'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ApiError } from '@/lib/client/api';
import type { ArtifactDto, ItemDto, JobDto, MatchDto, ProfileDto } from '@/lib/client/types';

export interface JobBundle {
  job: JobDto;
  profile: ProfileDto | null;
  items: ItemDto[];
  match: MatchDto;
  artifacts: ArtifactDto[];
}

export type JobBundleState = { state: 'loading' } | { state: 'error'; error: ApiError } | { state: 'ready'; data: JobBundle };

/**
 * One job with everything its pages show, read in parallel through the client data layer: the job, the core profile
 * and its items (labels), the AI-free match and the job's artifacts. Any failure is the page's state (a foreign or
 * absent job id is `not_found`, exactly like the API's 404); nothing is filled in.
 */
export function useJobBundle(jobId: string): { bundle: JobBundleState; reload: () => Promise<void>; setJob: (job: JobDto) => void } {
  const [bundle, setBundle] = useState<JobBundleState>({ state: 'loading' });

  const reload = useCallback(async () => {
    const job = await api.getJob(jobId);
    if (!job.ok) {
      setBundle({ state: 'error', error: job.error });
      return;
    }
    const [profile, match, artifacts] = await Promise.all([api.getProfile(), api.match(jobId), api.listArtifacts({ jobId })]);
    const failed = [profile, match, artifacts].find((r) => !r.ok);
    if (failed && !failed.ok) {
      setBundle({ state: 'error', error: failed.error });
      return;
    }
    if (!profile.ok || !match.ok || !artifacts.ok) return;
    setBundle({
      state: 'ready',
      data: { job: job.data.job, profile: profile.data.profile, items: profile.data.items, match: match.data, artifacts: artifacts.data.artifacts },
    });
  }, [jobId]);

  useEffect(() => {
    // Loads once per job id; the state updates happen after the fetches resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const setJob = useCallback((job: JobDto) => setBundle((b) => (b.state === 'ready' ? { state: 'ready', data: { ...b.data, job } } : b)), []);
  return { bundle, reload, setJob };
}
