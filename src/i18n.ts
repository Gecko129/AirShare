import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import it from "./i18n/it.json";
import en from "./i18n/en.json";
import es from "./i18n/es.json";
import fr from "./i18n/fr.json";
import de from "./i18n/de.json";
import zh from "./i18n/zh.json";

function detectSystemLanguage(): string {
  const supportedLanguages = ["it", "en", "es", "fr", "de", "zh"];
  
  const savedLanguage = localStorage.getItem("airshare-language");
  if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
    return savedLanguage;
  }
  
  let systemLanguage = navigator.language || navigator.languages?.[0] || "en";
  
  const primaryLanguage = systemLanguage.split("-")[0].toLowerCase();
  
  if (supportedLanguages.includes(primaryLanguage)) {
    return primaryLanguage;
  }
  
  return "it";
}

i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    zh: { translation: zh },
  },
  lng: detectSystemLanguage(),
  fallbackLng: "it",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("airshare-language", lng);
});

export default i18n;
