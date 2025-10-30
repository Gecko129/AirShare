import { GlassCard } from './GlassCard';
import { Button } from './ui/button';

export default function PrivacyPolicy() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2>Privacy Policy di AirShare</h2>
          <span>Ultimo aggiornamento: 29 ottobre 2025</span>
        </div>

        <main className="space-y-6">

          <GlassCard className="p-6 space-y-6 text-muted-foreground">
            <section>
              <h3 className="text-lg md:text-xl">1. Premessa</h3>
              <p>
                La presente informativa sulla privacy ("Privacy Policy") disciplina il trattamento dei dati personali e delle informazioni tecniche da parte di AirShare ("noi", "nostro" o l'"Applicazione") in conformità con la vigente normativa in materia di protezione dei dati personali, inclusi, ma non limitati a, il Regolamento (UE) 2016/679 ("GDPR") e le normative nazionali applicabili. L'uso dell'Applicazione implica l'accettazione delle condizioni e delle modalità di trattamento dei dati di seguito descritte.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">2. Titolare del trattamento</h3>
              <p>
                Il titolare del trattamento dei dati è l'utente stesso, in quanto utilizzatore dell'Applicazione in ambiente esclusivamente locale. Nessun dato personale è raccolto, elaborato o conservato da soggetti terzi o da server esterni.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">3. Natura del trattamento e dati personali coinvolti</h3>
              <p>
                AirShare è concepita per operare esclusivamente in ambiente locale (rete locale, LAN), senza l'impiego di infrastrutture esterne o cloud. Di conseguenza, non vengono raccolti dati personali identificativi esterni alla rete locale. I dati tecnici trattati, limitatamente al contesto della rete locale, comprendono ma non si limitano a:
              </p>
              <ul className="list-disc list-inside">
                <li>Identificatori univoci transazionali (es. UUID assegnato a ogni trasferimento)</li>
                <li>Nome e dimensione del file oggetto di trasferimento</li>
                <li>Tipo di trasferimento (ad esempio, file inviato o ricevuto)</li>
                <li>Stato di completamento o anomalie correlate al trasferimento</li>
                <li>Nomi dei dispositivi mittente e destinatario</li>
                <li>Timestamp relativi all’avvio e durata del trasferimento</li>
                <li>Velocità di trasferimento documentata durante l’operazione</li>
                <li>Categoria o tipologia del dispositivo coinvolto (es. desktop, mobile)</li>
              </ul>
              <p>
                Tali dati sono gestiti esclusivamente in locale e non vengono trasmessi, ceduti o diffusi a terzi o su infrastrutture esterne.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">4. Finalità e base giuridica del trattamento</h3>
              <p>
                Il trattamento dei dati sopra indicati è finalizzato esclusivamente al corretto funzionamento del servizio di trasferimento file fra dispositivi connessi alla medesima rete locale. Nel rispetto delle normative vigenti, la base giuridica del trattamento è rappresentata dall’esecuzione del servizio richiesto dall’utente medesimo.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">5. Modalità di trattamento e sicurezza dei dati</h3>
              <p>
                Il trasferimento dei dati avviene senza alcun passaggio attraverso server esterni o servizi cloud, circoscrivendo ogni attività esclusivamente alla rete locale dell’utente. Ai fini della tutela della riservatezza e integrità, i dati e i file trasferiti vengono criptati mediante algoritmi di crittografia avanzata a standard AES-256, adottati per prevenire accessi non autorizzati, manomissioni o intercettazioni illecite durante il processo di trasferimento.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">6. Conservazione dei dati</h3>
              <p>
                I dati riguardanti i trasferimenti sono memorizzati esclusivamente in locale sul dispositivo dell’utente e persistono per un tempo limitato, definito dall’utente stesso tramite le funzionalità dell’Applicazione, o fino a eventuale cancellazione manuale. AirShare non effettua alcun tipo di archiviazione remota.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">7. Diritti dell’utente e modalità di esercizio</h3>
              <p>Ai sensi della normativa applicabile, l’utente ha diritto di:</p>
              <ul className="list-disc list-inside">
                <li>Accedere ai dati tecnici conservati localmente e conoscerne il contenuto;</li>
                <li>Richiedere la rettifica di eventuali informazioni inesatte;</li>
                <li>Ottenere la cancellazione totale dei dati e la cessazione del trattamento;</li>
                <li>Opporsi a qualsiasi utilizzo illecito o non conforme alla presente informativa.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">8. Assenza di profilazione e monitoraggio</h3>
              <p>
                AirShare non effettua alcuna forma di profilazione degli utenti, né raccoglie informazioni per scopi di marketing o analisi del comportamento. Non vengono utilizzati cookie, tool di tracciamento, tag, beacon o altre tecnologie analoghe che possano raccogliere dati personali o anonimi.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">9. Esclusione di garanzie e limitazione di responsabilità</h3>
              <p>
                Sebbene l’Applicazione adotti misure tecniche per garantire la sicurezza e integrità del trasferimento, non si offre alcuna garanzia assoluta circa la completa assenza di perdite, corruzione o compromissioni dei file trasferiti. L’utente si impegna a effettuare backup regolari e a utilizzare AirShare sotto la propria esclusiva responsabilità, esonerando lo sviluppatore da qualsiasi responsabilità civile, penale o contrattuale relativa a danni diretti o indiretti derivanti dall’uso del software.
              </p>
            </section>

            <section>
              <h3 className="text-lg md:text-xl">10. Modifiche alla Privacy Policy</h3>
              <p>
                Ci riserviamo il diritto di apportare modifiche, aggiornamenti o integrazioni alla presente informativa in ogni momento al fine di adeguarla a aggiornamenti normativi o modifiche funzionali dell’Applicazione. Gli utenti saranno tenuti a prendere visione periodicamente della versione aggiornata pubblicata.
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
