import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { translations, Language } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('uk');

  useEffect(() => {
    if (window.api?.store?.getSettings) {
      window.api.store.getSettings().then((s) => {
        if (s?.language) {
          setLanguageState(s.language);
        }
      });
    }
  }, []);

  const setLanguage = async (newLang: Language) => {
    setLanguageState(newLang);
    if (window.api?.store?.saveSettings) {
      await window.api.store.saveSettings({ language: newLang });
    }
  };

  const t = useCallback(
    (keyPath: string, params?: Record<string, string | number>): string => {
      const keys = keyPath.split('.');
      let current: any = translations[language];

      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          // Fallback to uk
          let fallback: any = translations.uk;
          for (const fk of keys) {
            if (fallback && typeof fallback === 'object' && fk in fallback) {
              fallback = fallback[fk];
            } else {
              return keyPath;
            }
          }
          current = fallback;
          break;
        }
      }

      if (typeof current !== 'string') {
        return keyPath;
      }

      if (!params) return current;

      let result = current;
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        result = result.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramVal));
      });
      return result;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
