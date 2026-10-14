import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { Circle } from '@/lib/types';

/** Deep link target: helpawy://join/<code> */
export default function JoinByLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useI18n();
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const [circle, setCircle] = useState<Circle | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('join_circle', { p_code: code }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setState('bad');
      else {
        setCircle(data as Circle);
        setState('ok');
      }
    });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <Screen>
      <Card>
        <Body>
          {state === 'working' ? t('loading') : state === 'ok' ? t('joined', { name: circle?.name ?? '' }) : t('invalidCode')}
        </Body>
      </Card>
      {state === 'ok' && circle ? (
        <Button label={t('done')} onPress={() => router.replace({ pathname: '/circle/[id]', params: { id: circle.id } })} />
      ) : state === 'bad' ? (
        <Button label={t('done')} onPress={() => router.replace('/circles')} />
      ) : null}
    </Screen>
  );
}
