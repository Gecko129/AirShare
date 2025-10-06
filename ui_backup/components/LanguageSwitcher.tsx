import { useTranslation } from "react-i18next";
import { useState } from "react";

// Import espliciti delle bandiere dalla cartella assets
// Le immagini devono esistere in src/assets come it.jpg, en.jpg, ecc.
import itFlag from "../assets/it.jpg";
import enFlag from "../assets/en.jpg";
import esFlag from "../assets/es.jpg";
import frFlag from "../assets/fr.jpg";
import deFlag from "../assets/de.jpg";
import zhFlag from "../assets/zh.jpg";

type Language = {
  code: string;
  name: string;
  flagSrc: string;
};

const languages: Language[] = [
  { code: "it", name: "Italiano", flagSrc: itFlag },
  { code: "en", name: "English", flagSrc: enFlag },
  { code: "es", name: "Español", flagSrc: esFlag },
  { code: "fr", name: "Français", flagSrc: frFlag },
  { code: "de", name: "Deutsch", flagSrc: deFlag },
  { code: "zh", name: "中文", flagSrc: zhFlag },
];

type Props = {
  embedded?: boolean; // se true, non usa posizionamento fisso e il menu si apre verso il basso
};

export default function LanguageSwitcher({ embedded = false }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLang =
    languages.find((l) => l.code === i18n.language) || languages[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className={embedded ? "" : "fixed bottom-4 left-4 z-50"}>
      <div className="relative">
        {/* bottone principale */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white shadow transition-colors"
        >
          <img
            src={currentLang.flagSrc}
            alt={currentLang.code}
            className="h-4 w-auto max-w-[24px] rounded-[2px] object-contain bg-slate-700/40"
          />
          <span className="text-white font-sans">{currentLang.name}</span>
        </button>

        {/* menu a tendina */}
        {open && (
          <div
            className={
              embedded
                ? "absolute top-full mt-2 w-[260px] rounded-lg bg-slate-900 border border-slate-700 shadow-lg p-2"
                : "absolute bottom-full mb-2 w-[260px] rounded-lg bg-slate-900 border border-slate-700 shadow-lg p-2"
            }
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-700 rounded-md ${
                  lang.code === i18n.language ? "bg-slate-700" : ""
                }`}
              >
                <img
                  src={lang.flagSrc}
                  alt={lang.code}
                  className="h-4 w-auto max-w-[24px] rounded-[2px] object-contain bg-slate-700/40"
                />
                <span className="text-white font-sans">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}