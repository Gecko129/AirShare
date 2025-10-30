import { GlassCard } from './GlassCard';
import { Button } from './ui/button';

export default function TermsOfService() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2>Termini di Servizio di AirShare</h2>
        <span>Ultimo aggiornamento: 29 ottobre 2025</span>
      </div>

        <main className="space-y-6">
          <GlassCard className="p-6 space-y-6 text-muted-foreground">
            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">1. Premessa</h3>
              <p>
                I presenti Termini di Servizio (“Termini”) disciplinano l’utilizzo dell’applicazione AirShare (“Applicazione”), sviluppata per consentire il trasferimento di file tra dispositivi connessi alla medesima rete locale. L’accesso e l’uso dell’Applicazione implicano l’accettazione integrale e senza riserve dei presenti Termini da parte dell’utente.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">2. Descrizione del servizio</h3>
              <p>
                AirShare è un’applicazione software progettata esclusivamente per operare in ambiente locale, permettendo lo scambio diretto di file fra dispositivi connessi alla stessa rete LAN, senza l’ausilio di servizi esterni, server o infrastrutture cloud. Gli unici dati elaborati sono tecnici e limitati al contesto del trasferimento, come descritto nella Privacy Policy.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">3. Condizioni d’uso</h3>
              <p>
                L’utente si impegna a utilizzare l’Applicazione nel pieno rispetto delle leggi vigenti e a non impiegarla per attività illecite, dannose o contrarie alla buona fede e correttezza. È fatto severo divieto di utilizzare AirShare per il trasferimento di contenuti illegali, offensivi, protetti da copyright senza autorizzazione o in violazione di diritti di terzi.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">4. Responsabilità dell’utente</h3>
              <p>
                L’utente è esclusivamente responsabile della corretta gestione dei file trasferiti, inclusiva di backup e conservazione. AirShare non garantisce la completa integrità, sicurezza o disponibilità dei dati trasferiti né si assume responsabilità per eventuali perdite, corruzioni, cancellazioni o danni derivanti dall’uso o malfunzionamento dell’Applicazione.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">5. Limitazione di responsabilità</h3>
              <p>
                Nella misura massima consentita dalla legge, AirShare declina ogni responsabilità per danni diretti, indiretti, consequenziali o incidentali derivanti dall'uso o dall’impossibilità di utilizzo dell’Applicazione, inclusi ma non limitati a perdita di dati, mancato guadagno, interruzione dell’attività o danni a dispositivi.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">6. Assenza di garanzia</h3>
              <p>
                L’Applicazione viene fornita "così com’è" (“as is”) senza alcuna garanzia esplicita o implicita, incluse, ma non limitate a, garanzie di commerciabilità, idoneità per uno scopo particolare o non violazione di diritti di terzi.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">7. Proprietà intellettuale</h3>
              <p>
                Tutti i diritti di proprietà intellettuale relativi all’Applicazione, inclusi codici sorgente, marchi, loghi e materiali associati, sono di esclusiva proprietà del titolare dello sviluppo e sono tutelati dalle normative vigenti sul diritto d’autore e sulla proprietà industriale.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">8. Modifiche ai Termini</h3>
              <p>
                AirShare si riserva il diritto di modificare o aggiornare i presenti Termini in qualsiasi momento, con effetto immediato dalla pubblicazione della nuova versione nell’Applicazione o tramite notifica agli utenti. L’uso continuato dell’Applicazione costituisce accettazione tacita delle modifiche apportate.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">9. Durata e risoluzione</h3>
              <p>
                I presenti Termini sono validi dalla data di accettazione e rimangono in vigore fino alla cessazione dell’uso dell’Applicazione. L’utente può interrompere l’utilizzo dell’Applicazione in qualsiasi momento; AirShare si riserva il diritto di sospendere o cessare l’accesso in caso di violazione grave o reiterata dei Termini.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl font-semibold mb-2">10. Legge applicabile e foro competente</h3>
              <p>
                I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia relativa all’interpretazione o esecuzione dei Termini sarà competente in via esclusiva il Foro di Padova, salvo diverse disposizioni inderogabili di legge.
              </p>
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
