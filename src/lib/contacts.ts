import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

const DEFAULT_CC = '20'; // Egypt

/** Normalise a raw phone string to E.164 ("+201012345678"), or null if it cannot be one. */
export function normalizePhone(raw: string, cc = DEFAULT_CC): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  // Arabic-Indic digits → ASCII
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (s.startsWith('00')) s = '+' + s.slice(2);
  let digits: string;
  if (s.startsWith('+')) {
    digits = s.slice(1);
  } else if (s.startsWith('0')) {
    digits = cc + s.slice(1);
  } else if (s.startsWith(cc) && s.length >= cc.length + 9) {
    digits = s;
  } else {
    digits = cc + s;
  }
  if (!/^\d{8,15}$/.test(digits)) return null;
  return '+' + digits;
}

export async function hashPhone(e164: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, e164, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export async function hashRawPhone(raw: string): Promise<string | null> {
  const e = normalizePhone(raw);
  return e ? hashPhone(e) : null;
}

export async function contactsGranted(): Promise<boolean> {
  return (await Contacts.getPermissionsAsync()).granted;
}

export async function requestContacts(): Promise<boolean> {
  const cur = await Contacts.getPermissionsAsync();
  if (cur.granted) return true;
  return (await Contacts.requestPermissionsAsync()).granted;
}

/** Reads device contacts and returns a map of phone hash → display name. Stays on the device. */
export async function loadHashedContacts(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const PAGE = 300;
  for (let offset = 0; ; offset += PAGE) {
    const batch = await Contacts.Contact.getAllDetails(
      [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES],
      { limit: PAGE, offset },
    );
    for (const c of batch) {
      for (const p of c.phones ?? []) {
        const hash = p.number ? await hashRawPhone(p.number) : null;
        if (hash && !map.has(hash)) map.set(hash, c.fullName ?? '');
      }
    }
    if (batch.length < PAGE) break;
  }
  return map;
}

/** Uploads only the hashes (never names or numbers). Returns how many were synced. */
export async function syncContacts(userId: string): Promise<{ count: number; names: Map<string, string> }> {
  const names = await loadHashedContacts();
  const hashes = [...names.keys()];
  await supabase.from('contact_hashes').delete().eq('owner_id', userId);
  const CHUNK = 500;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const rows = hashes.slice(i, i + CHUNK).map((hash) => ({ owner_id: userId, hash }));
    const { error } = await supabase
      .from('contact_hashes')
      .upsert(rows, { onConflict: 'owner_id,hash', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { count: hashes.length, names };
}
