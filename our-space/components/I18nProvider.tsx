"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  PREFERENCES_BROADCAST_CHANNEL,
  PREFERENCES_UPDATED_EVENT,
  type AppLanguage,
  type UserPreferences,
} from "@/lib/preferences";
import {
  getDictionary,
  type Dictionary,
} from "@/lib/i18n";


type I18nContextValue = {
  language: AppLanguage;
  dictionary: Dictionary;
};


const I18nContext =
  createContext<I18nContextValue | null>(
    null
  );


export default function I18nProvider({
  initialLanguage,
  userId,
  children,
}: {
  initialLanguage: AppLanguage;
  userId: string;
  children: React.ReactNode;
}) {
  const [
    language,
    setLanguage,
  ] = useState<AppLanguage>(
    initialLanguage
  );

  useEffect(() => {
    function applyPreferences(
      preferences:
        | UserPreferences
        | undefined
    ) {
      if (
        preferences?.user_id ===
        userId
      ) {
        setLanguage(
          preferences.language
        );
      }
    }

    function handlePreferenceEvent(
      event: Event
    ) {
      const custom =
        event as CustomEvent<UserPreferences>;

      applyPreferences(
        custom.detail
      );
    }

    window.addEventListener(
      PREFERENCES_UPDATED_EVENT,
      handlePreferenceEvent
    );

    let channel:
      BroadcastChannel | null =
        null;

    if (
      typeof BroadcastChannel !==
      "undefined"
    ) {
      channel =
        new BroadcastChannel(
          PREFERENCES_BROADCAST_CHANNEL
        );

      channel.onmessage =
        (event) => {
          applyPreferences(
            event.data as
              | UserPreferences
              | undefined
          );
        };
    }

    return () => {
      window.removeEventListener(
        PREFERENCES_UPDATED_EVENT,
        handlePreferenceEvent
      );

      channel?.close();
    };
  }, [userId]);

  useEffect(() => {
    document.documentElement.lang =
      language;
  }, [language]);

  const value =
    useMemo(
      () => ({
        language,
        dictionary:
          getDictionary(
            language
          ),
      }),
      [language]
    );

  return (
    <I18nContext.Provider
      value={value}
    >
      {children}
    </I18nContext.Provider>
  );
}


export function useI18n() {
  const value =
    useContext(
      I18nContext
    );

  if (!value) {
    throw new Error(
      "useI18n must be used inside I18nProvider."
    );
  }

  return value;
}
