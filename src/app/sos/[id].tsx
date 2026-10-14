import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Body, Button, Card, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { getCoords } from '@/lib/location';
import { resolveSos, respondSos, signedMediaUrl, uploadSosMedia } from '@/lib/sos';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';
import type { SosAlert, SosEvent, SosMedia, SosStats } from '@/lib/types';

interface MediaItem extends SosMedia {
  url: string | null;
}

export default function SosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { session } = useAuth();
  const uid = session!.user.id;

  const [event, setEvent] = useState<SosEvent | null>(null);
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number; approx: boolean } | null>(null);
  const [stats, setStats] = useState<SosStats | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isMine = event?.user_id === uid;
  const live = event ? event.state === 'live' : loc != null;

  const load = useCallback(async () => {
    const [{ data: ev }, { data: al }] = await Promise.all([
      supabase.from('sos_events').select('*').eq('id', id).maybeSingle(),
      supabase.from('sos_alerts').select('*').eq('sos_id', id).eq('recipient_id', uid).maybeSingle(),
    ]);
    const e = (ev as SosEvent | null) ?? null;
    setEvent(e);
    setAlert((al as SosAlert | null) ?? null);

    if (e?.user_id === uid) {
      const { data: st } = await supabase.rpc('sos_stats', { p_id: id });
      setStats(((st as SosStats[] | null) ?? [])[0] ?? null);
    } else {
      const { data: l } = await supabase.rpc('sos_location_for_me', { p_id: id });
      const row = ((l as { lat: number; lng: number; approx: boolean }[] | null) ?? [])[0];
      setLoc(row ?? null);
    }

    const { data: m } = await supabase.from('sos_media').select('*').eq('sos_id', id).order('created_at');
    const items = await Promise.all(
      ((m ?? []) as SosMedia[]).map(async (x) => ({ ...x, url: await signedMediaUrl(x.path) })),
    );
    setMedia(items);
    setLoaded(true);
  }, [id, uid]);

  // Initial load, realtime, and light polling.
  useEffect(() => {
    load();
    const ch = supabase
      .channel('sos-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, load)
      .subscribe();
    const poll = setInterval(load, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [load, id]);

  // Recipient: mark seen once.
  const seenSent = useRef(false);
  useEffect(() => {
    if (!loaded || isMine || !alert || alert.seen_at || seenSent.current) return;
    seenSent.current = true;
    supabase.rpc('mark_alert_seen', { p_id: id });
  }, [loaded, isMine, alert, id]);

  // Victim: keep the live position fresh for people following the request.
  useEffect(() => {
    if (!isMine || event?.state !== 'live') return;
    const tick = async () => {
      const c = await getCoords();
      if (c) await supabase.from('sos_events').update({ lat: c.lat, lng: c.lng }).eq('id', id);
    };
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [isMine, event?.state, id]);

  /* ---------- victim controls ---------- */

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);

  async function upload(uri: string, kind: SosMedia['kind'], mime: string, ext: string) {
    setUploading(true);
    try {
      await uploadSosMedia(uid, id, uri, kind, mime, ext);
      await load();
    } catch {
      Alert.alert('', t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function capture(kind: 'photo' | 'video') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: [kind === 'photo' ? 'images' : 'videos'],
      quality: 0.7,
      videoMaxDuration: 30,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const ext = (a.fileName?.split('.').pop() ?? (kind === 'photo' ? 'jpg' : 'mp4')).toLowerCase();
    await upload(a.uri, kind, a.mimeType ?? (kind === 'photo' ? 'image/jpeg' : 'video/mp4'), ext);
  }

  async function toggleVoice() {
    if (recState.isRecording) {
      await recorder.stop();
      await supabase.from('sos_events').update({ mic_open: false }).eq('id', id);
      if (recorder.uri) await upload(recorder.uri, 'voice', 'audio/mp4', 'm4a');
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await supabase.from('sos_events').update({ mic_open: true }).eq('id', id);
  }

  async function finish(state: 'safe' | 'cancelled') {
    try {
      if (recState.isRecording) await recorder.stop();
      await resolveSos(id, state);
      await load();
    } catch {
      Alert.alert('', t('error'));
    }
  }

  /* ---------- recipient controls ---------- */

  async function respond(r: 'on_my_way' | 'cant') {
    setAlert((a) => (a ? { ...a, response: r } : a));
    try {
      await respondSos(id, r);
      await load(); // pulls the exact location once "on my way"
    } catch {
      Alert.alert('', t('error'));
    }
  }

  function openInMaps() {
    if (!loc) return;
    const label = encodeURIComponent(t('helpRequest'));
    const url =
      Platform.OS === 'ios'
        ? `maps:?q=${label}&ll=${loc.lat},${loc.lng}`
        : `geo:${loc.lat},${loc.lng}?q=${loc.lat},${loc.lng}(${label})`;
    Linking.openURL(url).catch(() => {});
  }

  /* ---------- render ---------- */

  if (!loaded) {
    return (
      <Screen>
        <Body muted>{t('loading')}</Body>
      </Screen>
    );
  }

  if (!event && !loc && !alert) {
    return (
      <Screen>
        <Card>
          <Body>{t('sosNotFound')}</Body>
        </Card>
        <Button label={t('done')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const point = isMine ? (event ? { lat: event.lat, lng: event.lng } : null) : loc;

  return (
    <Screen>
      {isMine ? (
        <Card style={{ borderColor: live ? colors.primary : colors.border, borderWidth: live ? 1.5 : 1 }}>
          <Row>
            <Pill
              label={live ? t('stateLive') : event?.state === 'safe' ? t('stateSafe') : t('stateCancelled')}
              tone={live ? 'danger' : event?.state === 'safe' ? 'success' : 'muted'}
            />
          </Row>
          <Text style={styles.big}>{live ? t('mySos') : t('sosEnded')}</Text>
          {live ? <Body muted>{t('mySosHint')}</Body> : null}
        </Card>
      ) : (
        <Card style={{ borderColor: live ? colors.primary : colors.border, borderWidth: live ? 1.5 : 1 }}>
          <Row>
            <Pill label={live ? t('stateLive') : t('stateEnded')} tone={live ? 'danger' : 'muted'} />
            {alert?.response ? <Pill label={t(`resp_${alert.response}` as const)} tone="info" /> : null}
          </Row>
          <Text style={styles.big}>{alert?.audience === 'nearby' ? t('nearYou') : t('helpRequest')}</Text>
        </Card>
      )}

      {point ? (
        <View style={styles.map}>
          <MapView
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            region={{
              latitude: point.lat,
              longitude: point.lng,
              latitudeDelta: !isMine && loc?.approx ? 0.02 : 0.006,
              longitudeDelta: !isMine && loc?.approx ? 0.02 : 0.006,
            }}
          >
            <Marker coordinate={{ latitude: point.lat, longitude: point.lng }} pinColor={colors.primary} />
          </MapView>
        </View>
      ) : null}

      {!isMine && loc ? (
        <>
          <Body small muted>
            {loc.approx ? t('approxLocation') : t('exactLocation')}
          </Body>
          <Button label={t('openMaps')} variant="secondary" onPress={openInMaps} style={{ marginTop: space.md }} />
        </>
      ) : null}

      {isMine && stats ? (
        <>
          <SectionTitle>{t('mySos')}</SectionTitle>
          <Row style={{ flexWrap: 'wrap', gap: space.md }}>
            <Stat label={t('statCircle')} value={stats.circle_total} />
            <Stat label={t('statNearby')} value={stats.nearby_total} />
            <Stat label={t('statSeen')} value={stats.seen} />
            <Stat label={t('statOnWay')} value={stats.on_my_way} />
          </Row>
        </>
      ) : null}

      {isMine && live ? (
        <>
          <SectionTitle>{t('mediaShared')}</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button label={t('addPhoto')} variant="secondary" onPress={() => capture('photo')} disabled={uploading} style={styles.mediaBtn} />
            <Button label={t('addVideo')} variant="secondary" onPress={() => capture('video')} disabled={uploading} style={styles.mediaBtn} />
            <Button
              label={recState.isRecording ? t('stopRecording') : t('recordVoice')}
              variant={recState.isRecording ? 'danger' : 'secondary'}
              onPress={toggleVoice}
              disabled={uploading}
              style={styles.mediaBtn}
            />
          </Row>
          {uploading ? <Body small muted>{t('uploading')}</Body> : null}
          <Button label={t('imSafe')} variant="success" onPress={() => finish('safe')} style={{ marginTop: space.xl }} />
          <Button label={t('cancelRequest')} variant="ghost" onPress={() => finish('cancelled')} style={{ marginTop: space.sm }} />
        </>
      ) : null}

      {!isMine && live ? (
        <Row style={{ marginTop: space.xl }}>
          <Button
            label={t('onMyWay')}
            variant={alert?.response === 'on_my_way' ? 'success' : 'primary'}
            onPress={() => respond('on_my_way')}
            style={{ flex: 1 }}
          />
          <Button
            label={t('cantHelp')}
            variant="secondary"
            onPress={() => respond('cant')}
            style={{ flex: 1 }}
          />
        </Row>
      ) : null}

      {!isMine && !live ? (
        <Body muted>{t('sosEnded')}</Body>
      ) : null}

      {media.length > 0 ? (
        <>
          <SectionTitle>{t('mediaShared')}</SectionTitle>
          {media.map((m) =>
            m.kind === 'photo' && m.url ? (
              <Image key={m.id} source={{ uri: m.url }} style={styles.photo} resizeMode="cover" />
            ) : (
              <Pressable key={m.id} onPress={() => m.url && Linking.openURL(m.url)}>
                <Card>
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {m.kind === 'video' ? t('addVideo') : t('recordVoice')} · {t('playVoice')}
                  </Text>
                </Card>
              </Pressable>
            ),
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: space.md, marginBottom: space.xs },
  map: { height: 240, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.border, marginBottom: space.sm },
  stat: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 2 },
  mediaBtn: { flexGrow: 1 },
  photo: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: space.md, backgroundColor: colors.border },
});
