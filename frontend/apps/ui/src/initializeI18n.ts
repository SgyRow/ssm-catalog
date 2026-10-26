import i18n from "i18next"
// import LanguageDetector from "i18next-browser-languagedetector"
import ClientBackend from "i18next-chained-backend"
import LocalStorageBackend from "i18next-localstorage-backend"
import XHR from "i18next-xhr-backend"
import {initReactI18next} from "react-i18next"

/** Bump when UI translation JSON changes so clients skip stale HTTP/local caches. */
const I18N_BUNDLE_REVISION = "2025062902"
const localizationPath = `/localization/{{lng}}/{{ns}}.json?v=${I18N_BUNDLE_REVISION}`

/** UI language is fixed to Russian; re-enable LanguageDetector + LanguageMenu to restore switching. */
const UI_LANGUAGE = "ru"

export function initializeI18n(): Promise<void> {
  return i18n
    // .use(LanguageDetector)
    .use(ClientBackend)
    .use(initReactI18next)
    .init({
      ns: ["_default"],
      defaultNS: "_default",
      lng: UI_LANGUAGE,
      supportedLngs: ["en", "ru"],
      fallbackLng: {
        ru: ["en"],
        default: ["en"]
      },
      fallbackNS: "_default",

      // detection: {
      //   order: ["querystring", "cookie", "localStorage"],
      //   lookupLocalStorage: "i18n_language",
      //   lookupQuerystring: "lang",
      //   lookupCookie: "i18n_language",
      //   caches: ["localStorage", "cookie"],
      //   cookieMinutes: 10
      // },
      backend: {
        backends: [LocalStorageBackend, XHR],
        backendOptions: [
          {
            prefix: `i18next_papermerge_${I18N_BUNDLE_REVISION}`,
            expirationTime: 5 * 1000,
            store: window.localStorage
          },
          {
            loadPath: localizationPath
          }
        ]
      },
      react: {
        useSuspense: false
      }
    })
    .then(() => {
      if (i18n.language !== UI_LANGUAGE) {
        void i18n.changeLanguage(UI_LANGUAGE)
      }
      console.log("i18n initialized successfully")
    })
    .catch(err => console.error("i18n initialization failed:", err))
}
