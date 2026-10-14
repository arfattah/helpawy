import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { Body, Button, Card, Chip, Field, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { stopBackground } from '@/lib/location';
import { pushPermissionGranted, registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { session, profile, updateProfile, signOut } = useAuth();
  const uid = session!.user.id;
  const [name, setName] = useState(profile?.display_name ?? '');
  const [notif, setNotif] = useState<boolean | null>(null);

  useEffect(() => {
    pushPermissionGranted().then(setNotif);
  }, []);

  useEffect(() => {
    if (profile) setName(profile.display_name);
  }, [profile?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeLang(l: 'ar' | 'en') {
    await setLang(l);
    updateProfile({ lang: l });
  }

  async function saveName() {
    if (!name.trim()) return;
    await updateProfile({ display_name: name.trim() });
    Alert.alert('', t('done'));
  }

  async function enableNotif() {
    setNotif(await registerForPush(uid, true));
  }

  function confirmDelete() {
    Alert.alert(t('deleteAccount'), t('deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.functions.invoke('delete-account');
          if (error) return Alert.alert('', t('error'));
          await stopBackground();
          await signOut();
        },
      },
    ]);
  }

  return (
    <Screen top>
      <Title>{t('settingsTitle')}</Title>

      <SectionTitle>{t('language')}</SectionTitle>
      <Row>
        <Chip label={t('langAr')} selected={lang === 'ar'} onPress={() => changeLang('ar')} />
        <Chip label={t('langEn')} selected={lang === 'en'} onPress={() => changeLang('en')} />
      </Row>

      <SectionTitle>{t('account')}</SectionTitle>
      <Card>
        <Field label={t('yourName')} value={name} onChangeText={setName} />
        <Button label={t('save')} variant="secondary" onPress={saveName} disabled={!name.trim() || name.trim() === profile?.display_name} />
        <Text style={{ color: colors.muted, marginTop: space.md }}>{session?.user.email}</Text>
      </Card>

      <SectionTitle>{t('notifications')}</SectionTitle>
      <Card>
        <Body small muted>
          {notif ? t('notifOn') : t('notifOff')}
        </Body>
        {!notif ? <Button label={t('enableNotif')} onPress={enableNotif} style={{ marginTop: space.md }} /> : null}
      </Card>

      <Button label={t('signOut')} variant="secondary" onPress={signOut} style={{ marginTop: space.lg }} />
      <Button label={t('deleteAccount')} variant="ghost" onPress={confirmDelete} style={{ marginTop: space.sm }} />
      <Body small muted>
        {t('version', { v: Constants.expoConfig?.version ?? '' })}
      </Body>
    </Screen>
  );
}
