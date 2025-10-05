import { useState } from 'react';
import { Settings as SettingsIcon, Globe, Monitor, Smartphone, Wifi, Shield, Info, Moon, Sun, Palette } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { useTheme } from './ThemeProvider';

const languages = [
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
];

export function Settings() {
  const { theme, setTheme, glassStyle, setGlassStyle } = useTheme();
  const [selectedLanguage, setSelectedLanguage] = useState('it');
  const [autoDiscovery, setAutoDiscovery] = useState(true);
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);

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

            <div className="space-y-2">
              <Label htmlFor="glass-style-select">Stile Vetro</Label>
              <Select value={glassStyle} onValueChange={setGlassStyle}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="liquid">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-60" />
                      <span>Liquid Glass</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="opaque">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-muted border" />
                      <span>Opaco</span>
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
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Network Settings */}
      <GlassCard className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            <h3>Rete</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Rilevamento automatico dispositivi</Label>
                <p className="text-sm text-muted-foreground">
                  Cerca automaticamente dispositivi AirShare sulla rete
                </p>
              </div>
              <Switch
                checked={autoDiscovery}
                onCheckedChange={setAutoDiscovery}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Crittografia end-to-end</Label>
                <p className="text-sm text-muted-foreground">
                  Proteggi i trasferimenti con crittografia AES-256
                </p>
              </div>
              <Switch
                checked={encryptionEnabled}
                onCheckedChange={setEncryptionEnabled}
              />
            </div>
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
            
            <Button variant="outline" className="w-full justify-start">
              <Monitor className="w-4 h-4 mr-2" />
              Cronologia trasferimenti
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
              <span>2.1.0</span>
            </div>
            <div className="flex justify-between">
              <span>Build</span>
              <span>2024.01.15</span>
            </div>
            <div className="flex justify-between">
              <span>Protocollo</span>
              <span>AirShare v3</span>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start p-0 h-auto">
              Privacy Policy
            </Button>
            <Button variant="ghost" className="w-full justify-start p-0 h-auto">
              Termini di Servizio
            </Button>
            <Button variant="ghost" className="w-full justify-start p-0 h-auto">
              Supporto
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}