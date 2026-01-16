import { GlassCard } from './GlassCard';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Shield, ArrowLeft, Calendar } from 'lucide-react';
import { Separator } from './ui/separator';

export default function PrivacyPolicy() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/4 dark:bg-blue-400/2 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-3/4 right-1/4 w-80 h-80 bg-purple-500/4 dark:bg-purple-400/2 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>
      
      
      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <h2>{t('privacy.title')}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>{t('privacy.last_updated', { date: '29/10/2025' })}</span>
        </div>
      </div>

      {/* Content */}
      <GlassCard className="p-6">
        <div className="space-y-6 text-muted-foreground">
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.1.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.1.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.2.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.2.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.3.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.3.intro')}</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2">
              <li className="leading-relaxed">{t('privacy.sections.3.list.1')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.2')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.3')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.4')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.5')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.6')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.7')}</li>
              <li className="leading-relaxed">{t('privacy.sections.3.list.8')}</li>
            </ul>
            <p className="leading-relaxed">{t('privacy.sections.3.outro')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.4.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.4.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.5.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.5.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.6.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.6.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.7.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.7.intro')}</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2">
              <li className="leading-relaxed">{t('privacy.sections.7.list.1')}</li>
              <li className="leading-relaxed">{t('privacy.sections.7.list.2')}</li>
              <li className="leading-relaxed">{t('privacy.sections.7.list.3')}</li>
              <li className="leading-relaxed">{t('privacy.sections.7.list.4')}</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.8.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.8.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.9.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.9.body')}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {t('privacy.sections.10.title')}
            </h3>
            <p className="leading-relaxed">{t('privacy.sections.10.body')}</p>
          </section>
        </div>
      </GlassCard>

      {/* Footer */}
      <div className="flex justify-between items-center">
        <Button 
          variant="outline" 
          onClick={() => { window.location.hash = '#/settings'; }}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('privacy.questions')} <a
            href="https://github.com/Gecko129/AirShare/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
            onClick={e => {
              e.preventDefault();
              window.open('https://github.com/Gecko129/AirShare/issues', '_blank', 'noopener,noreferrer');
            }}
          >GitHub</a>
        </p>
      </div>
        </div>
      </main>
    </div>
  );
}