import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n, type StringKey } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';
import { ago } from '@/lib/time';
import type { Circle, CircleMember, ListenRequest, LocMode, MediaMode, MemberLocation } from '@/lib/types';

interface MemberRow extends CircleMember {
  name: string;
  loc?: MemberLocation;
}

const LOC_MODES: LocMode[] = ['always', 'sos', 'off'];
const MEDIA_MODES: MediaMode[] = ['approval', 'sos', 'never'];

export default function CircleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { session } = useAuth();
  const uid = session!.user.id;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [incoming, setIncoming] = useState<(ListenRequest & { name: string })[]>([]);

  const load = useCallback(async () => {
    const [{ data: c }, { data: cm }, { data: locs }, { data: reqs }] = await Promise.all([
      supabase.from('circles').select('*').eq('id', id).maybeSingle(),
      supabase.from('circle_members').select('*').eq('circle_id', id),
      supabase.from('member_locations').select('*'),
      supabase
        .from('listen_requests')
        .select('*')
        .eq('circle_id', id)
        .eq('to_user', uid)
        .eq('state', 'pending')
        .order('created_at', { ascending: false }),
    ]);
    setCircle((c as Circle | null) ?? null);
    const rows = (cm ?? []) as CircleMember[];
    const ids = [...new Set([...rows.map((r) => r.user_id), ...((reqs ?? []) as ListenRequest[]).map((r) => r.from_user)])];
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id,display_name').in('id', ids)
      : { data: [] as { id: string; display_name: string }[] };
    const names = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    const locMap = new Map(((locs ?? []) as MemberLocation[]).map((l) => [l.user_id, l]));
    setMembers(
      rows
        .map((r) => ({ ...r, name: names.get(r.user_id) ?? '', loc: locMap.get(r.user_id) }))
        .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name))),
    );
    setIncoming(((reqs ?? []) as ListenRequest[]).map((r) => ({ ...r, name: names.get(r.from_user) ?? '' })));
  }, [id, uid]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('circle-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listen_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, id]);

  const mine = members.find((m) => m.user_id === uid);

  async function setMine(patch: Partial<Pick<CircleMember, 'loc_mode' | 'mic_mode' | 'cam_mode'>>) {
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, ...patch } : m)));
    const { error } = await supabase
      .from('circle_members')
      .update(patch)
      .eq('circle_id', id)
      .eq('user_id', uid);
    if (error) {
      Alert.alert('', t('error'));
      load();
    }
  }

  async function ask(to: string, kind: 'mic' | 'cam') {
    const { error } = await supabase
      .from('listen_requests')
      .insert({ circle_id: id, from_user: uid, to_user: to, kind });
    Alert.alert('', error ? t('error') : t('requestSent'));
  }

  async function answer(reqId: string, state: 'allowed' | 'denied') {
    setIncoming((r) => r.filter((x) => x.id !== reqId));
    await supabase.from('listen_requests').update({ state }).eq('id', reqId);
  }

  function leave() {
    Alert.alert(t('leave'), t('leaveConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('leave'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('circle_members').delete().eq('circle_id', id).eq('user_id', uid);
          if (error) return Alert.alert('', t('error'));
          router.back();
        },
      },
    ]);
  }

  if (!circle) {
    return (
      <Screen>
        <Body muted>{t('loading')}</Body>
      </Screen>
    );
  }

  const reqText = (r: ListenRequest & { name: string }) =>
    t(r.kind === 'mic' ? 'wantsMic' : r.kind === 'cam' ? 'wantsCam' : 'wantsBoth', {
      name: r.name || t('unknownContact'),
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: circle.name }} />

      {incoming.length > 0 ? (
        <>
          <SectionTitle>{t('requestsForMe')}</SectionTitle>
          {incoming.map((r) => (
            <Card key={r.id} style={{ borderColor: colors.warn }}>
              <Body>{reqText(r)}</Body>
              <Row style={{ marginTop: space.md }}>
                <Button label={t('allow')} variant="success" onPress={() => answer(r.id, 'allowed')} style={{ flex: 1 }} />
                <Button label={t('deny')} variant="secondary" onPress={() => answer(r.id, 'denied')} style={{ flex: 1 }} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle>{t('members')}</SectionTitle>
      {members.map((m) => {
        const isMe = m.user_id === uid;
        return (
          <Card key={m.user_id}>
            <Row>
              <Avatar name={m.name} color={isMe ? colors.primary : colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  {isMe ? `${m.name || t('me')} (${t('me')})` : m.name || t('unknownContact')}
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  {m.loc ? t('lastSeen', { when: ago(m.loc.updated_at, t) }) : t('locationHidden')}
                </Text>
              </View>
              {m.role === 'owner' ? <Pill label={t('owner')} tone="muted" /> : null}
            </Row>
            {!isMe ? (
              <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
                {m.mic_mode !== 'never' ? <Chip label={t('requestMic')} onPress={() => ask(m.user_id, 'mic')} /> : null}
                {m.cam_mode !== 'never' ? <Chip label={t('requestCam')} onPress={() => ask(m.user_id, 'cam')} /> : null}
              </Row>
            ) : null}
          </Card>
        );
      })}
      <Body small muted>
        {t('listenNote')}
      </Body>

      {mine ? (
        <>
          <SectionTitle>{t('privacy')}</SectionTitle>
          <Card>
            <ModeGroup
              label={t('privLocation')}
              value={mine.loc_mode}
              options={LOC_MODES}
              prefix="loc_"
              onChange={(v) => setMine({ loc_mode: v })}
            />
            <ModeGroup
              label={t('privMic')}
              value={mine.mic_mode}
              options={MEDIA_MODES}
              prefix="media_"
              onChange={(v) => setMine({ mic_mode: v })}
            />
            <ModeGroup
              label={t('privCam')}
              value={mine.cam_mode}
              options={MEDIA_MODES}
              prefix="media_"
              onChange={(v) => setMine({ cam_mode: v })}
              last
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('inviteCode')}</SectionTitle>
      <Card>
        <Text selectable style={{ fontSize: 28, fontWeight: '800', letterSpacing: 3, textAlign: 'center', color: colors.text }}>
          {circle.invite_code}
        </Text>
        <Button
          label={t('shareInvite')}
          variant="secondary"
          style={{ marginTop: space.md }}
          onPress={() => Share.share({ message: t('inviteText', { name: circle.name, code: circle.invite_code }) })}
        />
      </Card>

      <Button label={t('leave')} variant="ghost" onPress={leave} style={{ marginTop: space.lg }} />
    </Screen>
  );
}

function ModeGroup<T extends string>({
  label,
  value,
  options,
  prefix,
  onChange,
  last,
}: {
  label: string;
  value: T;
  options: T[];
  prefix: 'loc_' | 'media_';
  onChange: (v: T) => void;
  last?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: last ? 0 : space.lg }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 }}>{label}</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip key={o} label={t(`${prefix}${o}` as StringKey)} selected={value === o} onPress={() => onChange(o)} />
        ))}
      </Row>
    </View>
  );
}
