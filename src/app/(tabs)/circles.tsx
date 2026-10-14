import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, Chip, Field, Pill, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';
import type { Circle, CircleType } from '@/lib/types';

const TYPES: CircleType[] = ['family', 'friends', 'work', 'neighbors'];

interface CircleRow extends Circle {
  memberCount: number;
}

export default function Circles() {
  const { t } = useI18n();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session!.user.id;

  const [circles, setCircles] = useState<CircleRow[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<CircleType>('family');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const load = useCallback(async () => {
    const [{ data: cs }, { data: cm }] = await Promise.all([
      supabase.from('circles').select('*').order('created_at', { ascending: false }),
      supabase.from('circle_members').select('circle_id'),
    ]);
    const counts = new Map<string, number>();
    (cm ?? []).forEach((r) => counts.set(r.circle_id, (counts.get(r.circle_id) ?? 0) + 1));
    setCircles(((cs ?? []) as Circle[]).map((c) => ({ ...c, memberCount: counts.get(c.id) ?? 1 })));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('circles-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, uid]);

  async function create() {
    if (!name.trim()) return;
    setBusy('create');
    const { data, error } = await supabase.rpc('create_circle', { p_name: name.trim(), p_type: type });
    setBusy(null);
    if (error) return Alert.alert('', t('error'));
    setName('');
    await load();
    router.push({ pathname: '/circle/[id]', params: { id: (data as Circle).id } });
  }

  async function join() {
    if (!code.trim()) return;
    setBusy('join');
    const { data, error } = await supabase.rpc('join_circle', { p_code: code });
    setBusy(null);
    if (error) return Alert.alert('', error.message.includes('invalid_code') ? t('invalidCode') : t('error'));
    setCode('');
    await load();
    Alert.alert('', t('joined', { name: (data as Circle).name }));
  }

  return (
    <Screen top>
      <View style={{ height: insets.top ? 0 : 0 }} />
      <Title>{t('circlesTitle')}</Title>

      {circles.length === 0 ? <Body muted>{t('circlesEmpty')}</Body> : null}
      {circles.map((c) => (
        <Pressable key={c.id} onPress={() => router.push({ pathname: '/circle/[id]', params: { id: c.id } })}>
          <Card>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{c.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {t(`type_${c.type}` as const)} · {c.memberCount} {t('members')}
                </Text>
              </View>
              {c.owner_id === uid ? <Pill label={t('owner')} tone="muted" /> : null}
            </Row>
          </Card>
        </Pressable>
      ))}

      <SectionTitle>{t('newCircle')}</SectionTitle>
      <Card>
        <Field label={t('circleName')} value={name} onChangeText={setName} maxLength={60} />
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: '600' }}>{t('circleType')}</Text>
        <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
          {TYPES.map((x) => (
            <Chip key={x} label={t(`type_${x}` as const)} selected={type === x} onPress={() => setType(x)} />
          ))}
        </Row>
        <Button label={t('create')} onPress={create} loading={busy === 'create'} disabled={!name.trim()} />
      </Card>

      <SectionTitle>{t('joinCircle')}</SectionTitle>
      <Card>
        <Field
          label={t('enterCode')}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label={t('join')} variant="secondary" onPress={join} loading={busy === 'join'} disabled={!code.trim()} />
      </Card>
    </Screen>
  );
}
