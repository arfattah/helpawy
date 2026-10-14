import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Body, Button, Card, Chip, Field, Pill, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { contactsGranted, hashRawPhone, requestContacts, syncContacts, loadHashedContacts } from '@/lib/contacts';
import {
  isBackgroundRunning,
  isSharingEnabled,
  setSharingEnabled,
  startBackground,
  stopBackground,
} from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';
import type { Profile } from '@/lib/types';

interface ContactMatch {
  user_id: string;
  phone_hash: string;
  mutual: boolean;
}

const RADII: Profile['helper_radius_m'][] = [500, 1000, 2000];
const LINKS: Profile['helper_max_links'][] = [1, 2, 3];

export default function Helpers() {
  const { t } = useI18n();
  const { session, profile, updateProfile } = useAuth();
  const uid = session!.user.id;

  const [phone, setPhone] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState<number | null>(null);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [bg, setBg] = useState(false);
  const [share, setShare] = useState(true);

  const loadMatches = useCallback(async () => {
    const { data } = await supabase.rpc('my_contacts_on_helpawy');
    setMatches((data as ContactMatch[] | null) ?? []);
    if (await contactsGranted()) {
      try {
        setNames(await loadHashedContacts());
      } catch {}
    }
  }, []);

  useEffect(() => {
    loadMatches();
    isBackgroundRunning().then(setBg);
    isSharingEnabled().then(setShare);
  }, [loadMatches]);

  async function savePhone() {
    const h = await hashRawPhone(phone);
    if (!h) return Alert.alert('', t('phoneInvalid'));
    await updateProfile({ phone_hash: h });
    setPhone('');
    Alert.alert('', t('phoneSaved'));
  }

  async function sync() {
    if (!(await requestContacts())) return Alert.alert('', t('contactsDenied'));
    setSyncing(true);
    try {
      const { count, names: n } = await syncContacts(uid);
      setNames(n);
      setSynced(count);
      await loadMatches();
    } catch {
      Alert.alert('', t('error'));
    } finally {
      setSyncing(false);
    }
  }

  async function toggleBg(on: boolean) {
    if (on) {
      const ok = await startBackground(t('appName'), t('bgLocationHint'));
      if (!ok) Alert.alert('', t('bgDenied'));
      setBg(ok);
    } else {
      await stopBackground();
      setBg(false);
    }
  }

  async function toggleShare(on: boolean) {
    setShare(on);
    await setSharingEnabled(on);
    if (!on) setBg(false);
  }

  if (!profile) return null;

  return (
    <Screen top>
      <Title>{t('helpersTitle')}</Title>

      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{t('helperMode')}</Text>
            <Body small muted>
              {t('helperDesc')}
            </Body>
          </View>
          <Switch
            value={profile.helper_enabled}
            onValueChange={(v) => updateProfile({ helper_enabled: v })}
            trackColor={{ true: colors.primary }}
          />
        </Row>
        {profile.helper_enabled ? (
          <>
            <Label>{t('helperRadius')}</Label>
            <Row style={{ flexWrap: 'wrap' }}>
              {RADII.map((r) => (
                <Chip
                  key={r}
                  label={t('meters', { n: r })}
                  selected={profile.helper_radius_m === r}
                  onPress={() => updateProfile({ helper_radius_m: r })}
                />
              ))}
            </Row>
            <Label>{t('helperLinks')}</Label>
            <Row>
              {LINKS.map((l) => (
                <Chip
                  key={l}
                  label={String(l)}
                  selected={profile.helper_max_links === l}
                  onPress={() => updateProfile({ helper_max_links: l })}
                />
              ))}
            </Row>
            <Body small muted>
              {t('helperLinksHint')}
            </Body>

            <Row style={{ marginTop: space.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{t('quietHours')}</Text>
                <Body small muted>
                  {t('quietHoursHint')} ({profile.quiet_start}:00 – {profile.quiet_end}:00)
                </Body>
              </View>
              <Switch
                value={profile.quiet_hours}
                onValueChange={(v) => updateProfile({ quiet_hours: v })}
                trackColor={{ true: colors.primary }}
              />
            </Row>
            {profile.quiet_hours ? (
              <Row style={{ marginTop: space.md }}>
                <View style={{ flex: 1 }}>
                  <Body small>{t('quietAllowDirect')}</Body>
                </View>
                <Switch
                  value={profile.quiet_allow_direct}
                  onValueChange={(v) => updateProfile({ quiet_allow_direct: v })}
                  trackColor={{ true: colors.primary }}
                />
              </Row>
            ) : null}
          </>
        ) : null}
      </Card>

      <SectionTitle>{t('shareLocation')}</SectionTitle>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Body small muted>
              {t('shareLocationHint')}
            </Body>
          </View>
          <Switch value={share} onValueChange={toggleShare} trackColor={{ true: colors.primary }} />
        </Row>
        <Row style={{ marginTop: space.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{t('bgLocation')}</Text>
            <Body small muted>
              {t('bgLocationHint')}
            </Body>
          </View>
          <Switch value={bg} disabled={!share} onValueChange={toggleBg} trackColor={{ true: colors.primary }} />
        </Row>
      </Card>

      <SectionTitle>{t('myPhone')}</SectionTitle>
      <Card>
        <Field
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder={profile.phone_hash ? '••••••••••' : '01012345678'}
        />
        <Body small muted>
          {t('myPhoneHint')}
        </Body>
        <Button label={t('savePhone')} variant="secondary" onPress={savePhone} disabled={!phone.trim()} style={{ marginTop: space.md }} />
      </Card>

      <SectionTitle>{t('syncContacts')}</SectionTitle>
      <Card>
        <Body small muted>
          {t('contactsPrivacy')}
        </Body>
        <Button
          label={syncing ? t('syncing') : t('syncContacts')}
          onPress={sync}
          loading={syncing}
          style={{ marginTop: space.md }}
        />
        {synced != null ? (
          <Body small muted>
            {t('contactsSynced', { n: synced })}
          </Body>
        ) : null}
      </Card>

      <SectionTitle>{t('contactsOnApp')}</SectionTitle>
      {matches.length === 0 ? (
        <Body muted>{t('contactsNone')}</Body>
      ) : (
        matches.map((m) => (
          <Card key={m.user_id}>
            <Row>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>
                {names.get(m.phone_hash) || t('unknownContact')}
              </Text>
              <Pill label={m.mutual ? t('mutual') : t('oneWay')} tone={m.mutual ? 'success' : 'muted'} />
            </Row>
          </Card>
        ))
      )}
      <Body small muted>
        {t('mutualHint')}
      </Body>
    </Screen>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: space.lg, marginBottom: 6 }}>
      {children}
    </Text>
  );
}
