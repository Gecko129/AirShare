import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import it from "./i18n/it.json";
import en from "./i18n/en.json";
import es from "./i18n/es.json";
import fr from "./i18n/fr.json";
import de from "./i18n/de.json";
import zh from "./i18n/zh.json";

i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    zh: { translation: zh },
  },
  lng: "it",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
