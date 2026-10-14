import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SosButton } from '@/components/SosButton';
import { Avatar, Body, Button, Card, Pill, Row, SectionTitle, Title } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { getCoords, type Coords } from '@/lib/location';
import { createSos, formatDistance, SosError } from '@/lib/sos';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';
import { ago } from '@/lib/time';
import type { MemberLocation, SosAlert, SosEvent } from '@/lib/types';

interface Member extends MemberLocation {
  name: string;
}
interface AlertItem extends SosAlert {
  event?: SosEvent;
  name?: string;
}

export default function Home() {
  const { t } = useI18n();
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session!.user.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [circleCount, setCircleCount] = useState(0);
  const [me, setMe] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const map = useRef<MapView>(null);

  const load = useCallback(async () => {
    const [{ data: cm }, { data: locs }, { data: al }] = await Promise.all([
      supabase.from('circle_members').select('circle_id,user_id'),
      supabase.from('member_locations').select('*'),
      supabase
        .from('sos_alerts')
        .select('*')
        .eq('recipient_id', uid)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    setCircleCount(new Set((cm ?? []).filter((r) => r.user_id === uid).map((r) => r.circle_id)).size);

    const alertRows = (al ?? []) as SosAlert[];
    const sosIds = alertRows.map((a) => a.sos_id);
    const { data: evs } = sosIds.length
      ? await supabase.from('sos_events').select('*').in('id', sosIds)
      : { data: [] as SosEvent[] };
    const events = new Map(((evs ?? []) as SosEvent[]).map((e) => [e.id, e]));

    const ids = new Set<string>([
      ...((locs ?? []) as MemberLocation[]).map((l) => l.user_id),
      ...[...events.values()].map((e) => e.user_id),
    ]);
    const { data: profs } = ids.size
      ? await supabase.from('profiles').select('id,display_name').in('id', [...ids])
      : { data: [] as { id: string; display_name: string }[] };
    const names = new Map((profs ?? []).map((p) => [p.id, p.display_name]));

    setMembers(
      ((locs ?? []) as MemberLocation[]).map((l) => ({ ...l, name: names.get(l.user_id) ?? '' })),
    );
    setAlerts(
      alertRows.map((a) => {
        const event = events.get(a.sos_id);
        return { ...a, event, name: event ? names.get(event.user_id) : undefined };
      }),
    );
  }, [uid]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 600);
    };
    const ch = supabase
      .channel('home-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, refetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sos_events' }, refetch)
      .subscribe();
    getCoords().then(setMe);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [load, uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  async function trigger() {
    setBusy(true);
    try {
      const c = await getCoords();
      if (!c) {
        Alert.alert('', t('needLocation'));
        return;
      }
      const id = await createSos(c.lat, c.lng, false);
      router.push({ pathname: '/sos/[id]', params: { id } });
    } catch (e) {
      Alert.alert('', e instanceof SosError && e.code === 'rate_limited' ? t('sosRateLimited') : t('sosFailed'));
    } finally {
      setBusy(false);
    }
  }

  const fitted = useRef(false);
  const region = (() => {
    const pts = [...members.map((m) => ({ lat: m.lat, lng: m.lng })), ...(me ? [me] : [])];
    if (!pts.length) return { latitude: 30.0444, longitude: 31.2357, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(0.02, (Math.max(...lats) - Math.min(...lats)) * 1.6),
      longitudeDelta: Math.max(0.02, (Math.max(...lngs) - Math.min(...lngs)) * 1.6),
    };
  })();

  useEffect(() => {
    if (fitted.current || (!members.length && !me)) return;
    fitted.current = true;
    map.current?.animateToRegion(region, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length, me]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: space.xl * 2, paddingHorizontal: space.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Title>{profile?.display_name ? `${t('appName')} · ${profile.display_name}` : t('appName')}</Title>

      <View style={styles.mapWrap}>
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {members
            .filter((m) => m.user_id !== uid)
            .map((m) => (
              <Marker
                key={m.user_id}
                coordinate={{ latitude: m.lat, longitude: m.lng }}
                title={m.name || t('unknownContact')}
                description={ago(m.updated_at, t)}
                pinColor={colors.info}
              />
            ))}
        </MapView>
        {circleCount === 0 ? (
          <View style={styles.mapOverlay}>
            <Body>{t('homeNoCircle')}</Body>
            <Button label={t('homeGoCircles')} onPress={() => router.push('/circles')} style={{ marginTop: space.md }} />
          </View>
        ) : null}
      </View>

      {members.filter((m) => m.user_id !== uid).length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }} contentContainerStyle={{ gap: space.md }}>
          {members
            .filter((m) => m.user_id !== uid)
            .map((m) => (
              <Pressable
                key={m.user_id}
                onPress={() =>
                  map.current?.animateToRegion(
                    { latitude: m.lat, longitude: m.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                    400,
                  )
                }
                style={{ alignItems: 'center', width: 64 }}
              >
                <Avatar name={m.name} size={44} color={colors.info} />
                <Text numberOfLines={1} style={styles.memberName}>
                  {m.name || '…'}
                </Text>
              </Pressable>
            ))}
        </ScrollView>
      ) : null}

      <SosButton label={t('sosHold')} hint={t('sosHoldHint')} busy={busy} onTrigger={trigger} />

      <SectionTitle>{t('nearbyTitle')}</SectionTitle>
      {alerts.length === 0 ? (
        <Body muted>{t('nearbyEmpty')}</Body>
      ) : (
        alerts.map((a) => <AlertCard key={a.sos_id} a={a} />)
      )}
    </ScrollView>
  );
}

function AlertCard({ a }: { a: AlertItem }) {
  const { t } = useI18n();
  const circle = a.audience === 'circle';
  const live = a.event ? a.event.state === 'live' : true;
  const title = circle
    ? t('fromCircle', { name: a.name || t('someoneInCircle') })
    : t('nearYou');
  return (
    <Pressable onPress={() => router.push({ pathname: '/sos/[id]', params: { id: a.sos_id } })}>
      <Card style={live ? { borderColor: colors.primary, borderWidth: 1.5 } : undefined}>
        <Row>
          <Avatar name={circle ? a.name ?? '?' : '!'} color={circle ? colors.primary : colors.warn} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardMeta}>
              {ago(a.created_at, t)}
              {a.dist_m != null ? ` · ${t('away', { dist: formatDistance(a.dist_m, t) })}` : ''}
            </Text>
          </View>
          {a.event && a.event.state !== 'live' ? (
            <Pill label={a.event.state === 'safe' ? t('stateSafe') : t('stateCancelled')} tone={a.event.state === 'safe' ? 'success' : 'muted'} />
          ) : a.response ? (
            <Pill label={t('responded')} tone="info" />
          ) : live ? (
            <Pill label={t('stateLive')} tone="danger" />
          ) : null}
        </Row>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(250,250,247,0.92)',
    padding: space.lg,
    justifyContent: 'center',
  },
  memberName: { fontSize: 12, color: colors.muted, marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
