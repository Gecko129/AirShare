import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Globe, Monitor, Shield, Info, Moon, Sun, Palette } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { useTheme } from './ThemeProvider';
import { getVersion } from '@tauri-apps/api/app';

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


export function Settings() {
  const { theme, setTheme } = useTheme();
  const [selectedLanguage, setSelectedLanguage] = useState('it');
  const [] = useState(true);
  const [] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const v = await getVersion();
        setAppVersion(v);
      } catch (e) {
        // fallback silenzioso
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5" />
        <h2>Impostazioni</h2>
      </div>

      {/* Appearance Settings */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            <h3>Aspetto</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="theme-select">Tema</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      <span>Chiaro</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      <span>Scuro</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Language Settings */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <h3>Lingua</h3>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="language-select">Seleziona lingua dell'interfaccia</Label>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <div className="flex items-center gap-2">
                      <img src={lang.flagSrc} alt={lang.name} className="h-4 w-auto max-w-[24px] rounded-[2px] object-contain bg-slate-700/40" />
                      <span>{lang.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Transfer Settings */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            <h3>Trasferimenti</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Notifiche</Label>
                <p className="text-sm text-muted-foreground">
                  Ricevi notifiche per trasferimenti completati
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Accettazione automatica</Label>
                <p className="text-sm text-muted-foreground">
                  Accetta automaticamente file da dispositivi fidati
                </p>
              </div>
              <Switch
                checked={autoAccept}
                onCheckedChange={setAutoAccept}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Security */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <h3>Sicurezza</h3>
          </div>
          
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <Shield className="w-4 h-4 mr-2" />
              Gestisci dispositivi fidati
            </Button>
            
          </div>
        </div>
      </GlassCard>

      {/* About */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            <h3>Informazioni</h3>
          </div>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Versione</span>
              <span>{appVersion || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Build</span>
              <span>2024.01.15</span>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start p-0 h-auto" onClick={() => { window.location.hash = '#/privacy'; }}>
              Privacy Policy
            </Button>
            <Button variant="ghost" className="w-full justify-start p-0 h-auto" onClick={() => { window.location.hash = '#/terms'; }}>
              Termini di Servizio
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}