import { GlassCard } from './GlassCard';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

export default function TermsOfService() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2>{t('terms.title')}</h2>
        <span>{t('terms.last_updated', { date: '29 ottobre 2025' })}</span>
      </div>

        <main className="space-y-6">
          <GlassCard className="p-6 space-y-6 text-muted-foreground">
            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.1.title')}</h3>
              <p>{t('terms.sections.1.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.2.title')}</h3>
              <p>{t('terms.sections.2.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.3.title')}</h3>
              <p>{t('terms.sections.3.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.4.title')}</h3>
              <p>{t('terms.sections.4.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.5.title')}</h3>
              <p>{t('terms.sections.5.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.6.title')}</h3>
              <p>{t('terms.sections.6.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.7.title')}</h3>
              <p>{t('terms.sections.7.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.8.title')}</h3>
              <p>{t('terms.sections.8.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.9.title')}</h3>
              <p>{t('terms.sections.9.body')}</p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">{t('terms.sections.10.title')}</h3>
              <p>{t('terms.sections.10.body')}</p>
            </section>
          </GlassCard>
        </main>
        <div className="pt-4">
          <Button variant="outline" size="sm" onClick={() => { window.location.hash = '#/transfer'; }}>
            Torna indietro
          </Button>
        </div>
      </div>
  );
}
