import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Body, Button, Chip, Field, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

export default function SignIn() {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = email.trim();
    if (!e || password.length < 6 || (mode === 'up' && !name.trim())) {
      Alert.alert('', t('fillAll'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) Alert.alert('', t('authFailed'));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password,
          options: { data: { display_name: name.trim(), lang } },
        });
        if (error) Alert.alert('', error.message);
        else if (!data.session) Alert.alert('', t('checkEmail'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top>
        <View style={{ alignItems: 'center', marginTop: space.xl * 2, marginBottom: space.xl }}>
          <Image source={require('../../../assets/splash-icon.png')} style={{ width: 96, height: 96, marginBottom: space.md }} />
          <Text style={{ fontSize: 30, fontWeight: '900', color: colors.text }}>{t('appName')}</Text>
          <Body muted>{t('tagline')}</Body>
        </View>

        <Row style={{ justifyContent: 'center', marginBottom: space.lg }}>
          <Chip label="العربية" selected={lang === 'ar'} onPress={() => setLang('ar')} />
          <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
        </Row>

        {mode === 'up' ? (
          <Field label={t('displayName')} value={name} onChangeText={setName} autoCapitalize="words" />
        ) : null}
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button label={mode === 'in' ? t('signIn') : t('signUp')} onPress={submit} loading={busy} />
        <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ padding: space.lg }}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '600' }}>
            {mode === 'in' ? t('noAccount') : t('haveAccount')}
          </Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
