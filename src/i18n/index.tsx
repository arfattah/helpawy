import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, I18nManager } from 'react-native';
import { ar, en, type StringKey } from './strings';

export type Lang = 'ar' | 'en';
const KEY = 'helpawy.lang';

function defaultLang(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'ar';
}

function applyDirection(lang: Lang): boolean {
  const rtl = lang === 'ar';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true; // needs a restart to take effect
  }
  return false;
}

interface Ctx {
  lang: Lang;
  isRTL: boolean;
  ready: boolean;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => Promise<void>;
}

const LangContext = createContext<Ctx>(null as unknown as Ctx);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(defaultLang());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let l = defaultLang();
      try {
        const stored = await AsyncStorage.getItem(KEY);
        if (stored === 'ar' || stored === 'en') l = stored;
      } catch {}
      applyDirection(l);
      setLangState(l);
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    try {
      await AsyncStorage.setItem(KEY, l);
    } catch {}
    if (applyDirection(l)) {
      Alert.alert('', l === 'ar' ? ar.restartForLang : en.restartForLang);
    }
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      let s = (lang === 'ar' ? ar : en)[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, isRTL: lang === 'ar', ready, t, setLang }),
    [lang, ready, t, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useI18n = () => useContext(LangContext);
export type { StringKey };
