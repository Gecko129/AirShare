import { GlassCard } from './GlassCard';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

export default function PrivacyPolicy() {
  const { t } = useTranslation();
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
        <h2>{t('privacy.title')}</h2>
        <span>{t('privacy.last_updated', { date: '29 ottobre 2025' })}</span>
        </div>

        <main className="space-y-6">

          <GlassCard className="p-6 space-y-6 text-muted-foreground">
            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.1.title')}</h3>
            <p>{t('privacy.sections.1.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.2.title')}</h3>
            <p>{t('privacy.sections.2.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.3.title')}</h3>
            <p>{t('privacy.sections.3.intro')}</p>
            <ul className="list-disc list-inside">
              <li>{t('privacy.sections.3.list.1')}</li>
              <li>{t('privacy.sections.3.list.2')}</li>
              <li>{t('privacy.sections.3.list.3')}</li>
              <li>{t('privacy.sections.3.list.4')}</li>
              <li>{t('privacy.sections.3.list.5')}</li>
              <li>{t('privacy.sections.3.list.6')}</li>
              <li>{t('privacy.sections.3.list.7')}</li>
              <li>{t('privacy.sections.3.list.8')}</li>
            </ul>
            <p>{t('privacy.sections.3.outro')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.4.title')}</h3>
            <p>{t('privacy.sections.4.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.5.title')}</h3>
            <p>{t('privacy.sections.5.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.6.title')}</h3>
            <p>{t('privacy.sections.6.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.7.title')}</h3>
            <p>{t('privacy.sections.7.intro')}</p>
              <ul className="list-disc list-inside">
              <li>{t('privacy.sections.7.list.1')}</li>
              <li>{t('privacy.sections.7.list.2')}</li>
              <li>{t('privacy.sections.7.list.3')}</li>
              <li>{t('privacy.sections.7.list.4')}</li>
              </ul>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.8.title')}</h3>
            <p>{t('privacy.sections.8.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.9.title')}</h3>
            <p>{t('privacy.sections.9.body')}</p>
            </section>

            <section>
            <h3 className="text-lg md:text-xl">{t('privacy.sections.10.title')}</h3>
            <p>{t('privacy.sections.10.body')}</p>
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
