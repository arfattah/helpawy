import { supabase } from './supabase';
import type { SosMedia } from './types';

export class SosError extends Error {
  constructor(public code: 'rate_limited' | 'no_location' | 'failed') {
    super(code);
  }
}

/** Creates the SOS (circle + nearby alerts are computed server-side) and fires the push fan-out. */
export async function createSos(lat: number, lng: number, mic = false): Promise<string> {
  const { data, error } = await supabase.rpc('create_sos', { p_lat: lat, p_lng: lng, p_mic: mic });
  if (error) {
    if (error.message.includes('rate_limited')) throw new SosError('rate_limited');
    throw new SosError('failed');
  }
  const id = data as string;
  // Best effort: the SOS exists either way; pushes just won't go out if this fails.
  supabase.functions.invoke('notify-sos', { body: { sos_id: id } }).catch(() => {});
  return id;
}

export async function resolveSos(id: string, state: 'safe' | 'cancelled') {
  const { error } = await supabase.rpc('resolve_sos', { p_id: id, p_state: state });
  if (error) throw error;
}

export async function respondSos(id: string, response: 'on_my_way' | 'cant') {
  const { error } = await supabase.rpc('respond_sos', { p_id: id, p_response: response });
  if (error) throw error;
}

export async function uploadSosMedia(
  userId: string,
  sosId: string,
  uri: string,
  kind: SosMedia['kind'],
  mime: string,
  ext: string,
) {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  const path = `${userId}/${sosId}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from('sos-media').upload(path, buf, { contentType: mime });
  if (up.error) throw up.error;
  const ins = await supabase.from('sos_media').insert({ sos_id: sosId, user_id: userId, kind, path });
  if (ins.error) throw ins.error;
}

export async function signedMediaUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('sos-media').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function formatDistance(m: number, t: (k: 'meters', v: { n: number }) => string): string {
  if (m < 1000) return t('meters', { n: Math.max(10, Math.round(m / 10) * 10) });
  return `${(m / 1000).toFixed(1)} km`;
}
