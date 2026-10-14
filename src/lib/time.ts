import type { StringKey } from '@/i18n/strings';

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

export function ago(iso: string, t: T): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('justNow');
  if (mins < 60) return t('minAgo', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('hrAgo', { n: hrs });
  return t('dayAgo', { n: Math.round(hrs / 24) });
}
