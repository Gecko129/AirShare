import { useTranslation } from "react-i18next";
import { useState } from "react";

const languages = [
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLang =
    languages.find((l) => l.code === i18n.language) || languages[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="relative">
        {/* bottone principale */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white shadow"
        >
          <span className="text-lg">{currentLang.flag}</span>
          <span className="text-white font-sans">{currentLang.name}</span>
        </button>

        {/* menu a tendina */}
        {open && (
          <div className="absolute bottom-full mb-2 w-44 rounded-lg bg-slate-900 border border-slate-700 shadow-lg">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-700 ${
                  lang.code === i18n.language ? "bg-slate-700" : ""
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="text-white font-sans">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}