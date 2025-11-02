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
import { useTranslation } from 'react-i18next';
import { TrustedDevicesManager } from './TrustedDevicesManager';

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
  const { t, i18n } = useTranslation();
  
  // Initialize from i18n current language (persisted via localStorage in i18n.ts) to avoid resetting to Italian
  const [selectedLanguage, setSelectedLanguage] = useState(() => (i18n.language as string) || 'it');
  const [notifications, setNotifications] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [showTrustedDevices, setShowTrustedDevices] = useState(false);

  // Sync auto-accept with backend settings
  useEffect(() => {
    // lazy import to avoid bundling tauri api in environments where not present
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<boolean>("get_auto_accept_trusted").then((val) => {
        setAutoAccept(!!val);
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_auto_accept_trusted", { value: autoAccept }).catch(() => {});
    });
  }, [autoAccept]);

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

  // Cambia la lingua quando selectedLanguage cambia
  useEffect(() => {
    i18n.changeLanguage(selectedLanguage);
  }, [selectedLanguage, i18n]);

  // Mantiene sincronizzato lo stato locale quando la lingua cambia altrove
  useEffect(() => {
    const handler = (lng: string) => setSelectedLanguage(lng);
    i18n.on('languageChanged', handler);
    // Sync immediata all'avvio del componente
    setSelectedLanguage((i18n.language as string) || 'it');
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, [i18n]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5" />
        <h2>{t('settings.title')}</h2>
      </div>

      {/* Appearance Settings */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            <h3>{t('settings.appearance')}</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="theme-select">{t('settings.theme')}</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      <span>{t('settings.theme_light')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      <span>{t('settings.theme_dark')}</span>
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
            <h3>{t('settings.language')}</h3>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language-select">{t('settings.language_select_label')}</Label>
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
            <h3>{t('settings.transfers')}</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>{t('settings.notifications')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.notifications_desc')}
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
                <Label>{t('settings.auto_accept')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.auto_accept_desc')}
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
            <h3>{t('settings.security')}</h3>
          </div>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setShowTrustedDevices(true)}
            >
              <Shield className="w-4 h-4 mr-2" />
              {t('settings.manage_trusted_devices')}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* About */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            <h3>{t('settings.info')}</h3>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>{t('settings.version')}</span>
              <span>{appVersion || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('settings.build')}</span>
              <span>2024.01.15</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start p-0 h-auto" onClick={() => { window.location.hash = '#/privacy'; }}>
              {t('settings.privacy_policy')}
            </Button>
            <Button variant="ghost" className="w-full justify-start p-0 h-auto" onClick={() => { window.location.hash = '#/terms'; }}>
              {t('settings.terms_of_service')}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start p-0 h-auto"
              onClick={() => { window.open('https://github.com/Gecko129/AirShare/issues', '_blank'); }}
            >
              {t('settings.support')}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Trusted Devices Manager Dialog */}
      <TrustedDevicesManager 
        open={showTrustedDevices} 
        onOpenChange={setShowTrustedDevices} 
      />
    </div>
  );
}