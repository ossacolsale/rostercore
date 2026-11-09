import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import italian from "./locales/it.json";

type Language = "en" | "it";
type Values = Record<string, string | number>;
export type Translate = (text: string, values?: Values) => string;
const STORAGE = "rostercore.language.v1";
const catalogue: Record<string, string> = italian;

export function translate(
  language: Language,
  text: string,
  values: Values = {},
): string {
  const template =
    language === "it" && Object.hasOwn(catalogue, text)
      ? catalogue[text]
      : text;
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : token,
  );
}

const diagnosticSummaries: Record<string, string> = {
  ARCHIVE_CONTEXT_REQUIRED:
    "Manca il contesto originale di idoneità per una parte dello storico. Importa i contesti datati originali: le quote non possono essere ricostruite per ipotesi.",
  ARCHIVE_INTEGRITY:
    "L’impronta di integrità non coincide con il contenuto del calendario o del backup. Importazione annullata.",
  ARCHIVE_CONTEXT:
    "Il contesto originale del calendario non coincide con lo scenario incorporato.",
  ARCHIVE_IDENTITY:
    "L’identità o la revisione dell’archivio è in conflitto con un calendario esistente.",
  ARCHIVE_SCENARIO:
    "Il calendario appartiene a un altro scenario. Ripristina esplicitamente il contesto originale oppure un backup completo.",
  ARCHIVE_PERIOD:
    "La data richiesta non rientra nel periodo valido del calendario.",
  ARCHIVE_STATE:
    "L’operazione non è consentita nello stato corrente del calendario.",
  ARCHIVE_REFERENCE:
    "Manca un calendario o un identificatore stabile necessario. Ripristina il contesto originale.",
  ARCHIVE_REVISION:
    "La revisione deve riferirsi alla pubblicazione ufficiale attiva e conservare il calendario originale.",
  ARCHIVE_OVERLAP:
    "I turni importati sono in conflitto con una pubblicazione ufficiale. Crea prima una proposta di revisione.",
  ARCHIVE_HISTORY_CONFLICT:
    "Il lavoro completato importato è in conflitto con lo storico effettivo. Lo storico non è stato sovrascritto.",
  ARCHIVE_INVALID:
    "Il calendario archiviato non supera la verifica indipendente dei vincoli.",
  ARCHIVE_CURRENT_CONFLICT:
    "I turni archiviati sono incompatibili con la configurazione corrente.",
  ARCHIVE_COMPLETION:
    "Il periodo di lavoro svolto deve essere esplicito, verificabile e non può retrocedere.",
  SCENARIO_CONFLICT:
    "Il documento indica uno scenario diverso da quello previsto. Controlla l’identificatore stabile e la modalità di importazione.",
  CHANGE_SET_CONFLICT:
    "Questo identificatore di modifica è già stato usato con un contenuto differente.",
  ENTITY_CONFLICT:
    "Un’entità è cambiata dopo la preparazione del documento. Esporta un nuovo contesto e rigenera la modifica.",
  HARD_RULE_AUTHORIZATION:
    "La modifica di calendario, definizioni o vincoli richiede un’autorizzazione esplicita.",
  PROTECTED_ASSIGNMENT:
    "La modifica interessa turni effettivi o pubblicati. Crea una revisione futura esplicita senza alterare lo storico.",
  SPACING_TARGET:
    "Seleziona almeno un turno gravoso o una categoria condivisa.",
  SPACING_NORMAL:
    "I turni normali devono essere lavorativi e distinti dalla categoria gravosa; selezionali esplicitamente per la distanza in lavoro effettivo.",
  VERIFY_SPACING:
    "La verifica indipendente ha rilevato una violazione del distanziamento obbligatorio.",
  WORKLOAD_MISMATCH:
    "Il rapporto sul carico non coincide con il ricalcolo indipendente delle assegnazioni.",
  DUPLICATE_WEEKDAY:
    "Uno schema di lavoro può avere una sola eccezione per ciascun giorno della settimana.",
  IMPROVEMENT_CONTEXT:
    "La ricerca di miglioramento richiede la stessa configurazione operativa. Per cambiare i vincoli crea una revisione.",
  SEARCH_BUDGET:
    "Il tempo di ricerca deve essere compreso tra zero e 600 secondi.",

  WORK_PATTERN_ASSIGNMENT_CONFLICT:
    "Più regole automatiche con la stessa priorità massima assegnano schemi differenti alla stessa persona e data. Correggi le priorità, i selettori o gli intervalli di efficacia.",
  WORK_PATTERN_UNASSIGNED:
    "Nessuno schema viene risolto per il dipendente. Si applica il comportamento esistente senza restrizioni di schema; verifica se manca una regola.",
  SCHEMA_VERSION:
    "Questa funzione richiede il contratto versione 3. Esegui la migrazione esplicita preservando le assegnazioni individuali esistenti.",
  WEEK_CONFLICT:
    "Due regole o assegnazioni classificano la stessa settimana in modo incompatibile.",
  WEEK_OVERRIDE_REQUIRED:
    "La deroga alla ricorrenza richiede un'autorizzazione esplicita e una motivazione.",
  WEEK_UNCLASSIFIED:
    "La settimana non ha un profilo. Configura una ricorrenza, la scelta automatica o un profilo predefinito.",
  WEEK_ALIGNMENT:
    "Le decorrenze dei cicli e della selezione automatica devono essere lunedì ISO.",
  TEMPORAL_OVERLAP: "Gli intervalli di validità temporale si sovrappongono.",
  ATTRIBUTE_TYPE:
    "Il valore non rispetta il tipo o l'enumerazione definiti nel catalogo degli attributi.",
  WORK_PATTERN_GAP:
    "Il dipendente non dispone di uno schema di lavoro valido per la data indicata.",
  VARIANT_AMBIGUITY:
    "Più varianti orarie hanno la stessa priorità per lo stesso dipendente e la stessa data.",
  INSUFFICIENT_COVERAGE:
    "Le disponibilità, le abilitazioni o gli orari effettivi non permettono di soddisfare la copertura richiesta.",
  COVERAGE_INTERVALS:
    "La copertura per presenza richiede fasce orarie effettive.",
  COVERAGE_LEVEL:
    "I livelli di preferenza devono essere univoci all'interno del requisito.",
  CLOSURE_PROTECTED_CONFLICT:
    "La chiusura aziendale si sovrappone a un turno protetto, anche per la parte notturna nel giorno successivo.",
  UNSUPPORTED_TIMEZONE:
    "I vincoli di riposo effettivo supportano UTC ed Europe/Rome. Gli altri fusi non vengono interpretati come minuti civili esatti.",
  AMBIGUOUS_LOCAL_TIME:
    "L'ora locale è ambigua al cambio d'ora. Specifica l'occorrenza iniziale o finale della fascia.",
  NONEXISTENT_LOCAL_TIME:
    "L'ora locale non esiste al cambio d'ora oppure non rientra nel periodo coperto dai dati offline.",
  HOLIDAY_OPERATIONAL:
    "La data è festiva, ma il profilo settimanale consente di lavorare: la configurazione è ammessa.",
  NO_EXPLICIT_REFERENCE:
    "Questo elemento del catalogo non ha riferimenti espliciti. I selettori generali possono comunque includerlo.",
  FREQUENCY:
    "La frequenza configurata contiene limiti incompatibili o una finestra mobile mancante.",
  REGENERATION_RANGE:
    "La data di rigenerazione deve rientrare nell'orizzonte corrente.",
  HISTORY_PROTECTED:
    "Non è consentito modificare il profilo di una settimana già consolidata.",

  SCHEMA:
    "Il documento non rispetta lo schema JSON. Controlla campi obbligatori, proprietà sconosciute, tipi e funzioni supportate.",
  SCHEMA_NOT_FOUND:
    "Schemi JSON non trovati. Controlla l'installazione o la variabile ROSTERCORE_SCHEMA_DIR.",
  JSON_PARSE: "JSON non valido. Controlla la sintassi del documento.",
  JSON_DUPLICATE_KEY: "Il documento JSON contiene una proprietà duplicata.",
  NUMERIC_LIMIT:
    "Il calcolo esatto supera i limiti numerici supportati oppure contiene un denominatore non valido.",
  DATE: "Data non valida. Usa date gregoriane nel formato AAAA-MM-GG, comprese tra il 1900 e il 2200.",
  DATE_RANGE: "La data iniziale deve precedere o coincidere con quella finale.",
  HORIZON_LIMIT: "L'orizzonte deve contenere da 1 a 1096 giornate.",
  SIZE_LIMIT:
    "Lo scenario supera i limiti di dimensione supportati. Controlla il numero di dipendenti, turni e giornate.",
  DUPLICATE_ID:
    "Un identificatore è duplicato. Ogni entità dello stesso tipo deve avere un ID univoco.",
  REFERENCE:
    "Un riferimento indica un'entità inesistente. Controlla gli ID utilizzati.",
  GROUP_CYCLE: "I gruppi contengono riferimenti circolari.",
  SHIFT_INTERVALS:
    "Fasce orarie non valide: il riposo non deve avere intervalli; i turni lavorativi richiedono fasce positive, non sovrapposte e lunghe al massimo 24 ore civili.",
  ISO_WEEK:
    "Settimana ISO non valida. Usa il formato AAAA-Wss e una settimana esistente nell'anno indicato.",
  TIMEZONE:
    "Specifica UTC oppure un fuso orario in notazione IANA, ad esempio Europe/Rome.",
  AST_LIMIT:
    "L'espressione supera il limite di profondità o il numero massimo di nodi supportato.",
  AMBIGUOUS_REMAINING:
    "La clausola dei rimanenti è ambigua. Inseriscila in un ramo AND senza gruppi annidati, con clausole COUNT che usano lo stesso selettore.",
  DEPENDENCY:
    "Le dipendenze simboliche devono essere univoche e iniziare con @.",
  UNRESOLVED_DEPENDENCY:
    "Una politica con dipendenze irrisolte deve rimanere una bozza inattiva.",
  EMPTY_TARGET: "Seleziona almeno un turno da bilanciare.",
  WEIGHTS:
    "Controlla i pesi: CUSTOM_WEIGHTED richiede un peso intero positivo per ogni dipendente selezionato; le altre modalità non accettano pesi personalizzati.",
  NO_PARTICIPANTS:
    "Non ci sono partecipanti idonei per distribuire le assegnazioni dell'obiettivo.",
  HISTORY_OVERLAP:
    "Lo storico consolidato deve precedere interamente l'orizzonte da pianificare.",
  HISTORY_DUPLICATE:
    "Lo storico contiene un'assegnazione o un'istantanea di partecipazione duplicata.",
  HISTORY_WATERMARK:
    "Un'assegnazione supera la data limite dello storico consolidato.",
  HISTORY_REBUILD_REQUIRED:
    "La definizione dell'obiettivo è cambiata. Ricalcola le istantanee di partecipazione usando i contesti storici originali prima di generare il calendario.",
  HISTORY_SNAPSHOT_REQUIRED:
    "Manca un'istantanea di partecipazione necessaria per ricostruire l'equità storica.",
  HISTORY_PARTICIPANTS:
    "Un partecipante dell'istantanea storica non appartiene al selettore dell'obiettivo.",
  HISTORY_CONTEXT_RANGE:
    "I contesti storici devono precedere l'orizzonte corrente.",
  HISTORY_CONTEXT_OVERLAP: "I contesti storici non possono sovrapporsi.",
  HISTORY_CONTEXT_CONFLICT:
    "Un'assegnazione storica ricade in una data esclusa dal contesto fornito.",
  HISTORY_CONTEXT_MISSING:
    "I contesti forniti non coprono tutte le date delle assegnazioni storiche.",
  DUPLICATE_ASSIGNMENT:
    "È presente più di un'assegnazione per lo stesso dipendente nella stessa data.",
  UNSUPPORTED_PARTIAL_ABSENCE:
    "La gestione operativa delle assenze parziali non è supportata in questa versione.",
  HR_DUPLICATE:
    "Esiste un duplicato della coppia sistema di origine / ID esterno negli eventi HR.",
  DETERMINISM:
    "La modalità deterministica richiede un solo processo di ricerca.",
  EMPTY_ALLOWED_INTERSECTION:
    "L'intersezione delle restrizioni non consente alcun turno per un dipendente in una giornata pianificabile.",
  HARD_CONFLICT:
    "I vincoli obbligatori sono incompatibili. L'insieme di conflitto indicato nei dettagli è sufficiente, ma non necessariamente minimo.",
  CP_SAT_MODEL:
    "Il backend CP-SAT ha rifiutato il modello. Consulta i dettagli tecnici.",
  VERIFY: "Il risultato non contiene assegnazioni da verificare.",
  ASSIGNMENT_REFERENCE:
    "Un'assegnazione contiene un dipendente, un turno o una data fuori dall'orizzonte non validi.",
  FORBIDDEN_ASSIGNMENT:
    "È presente un'assegnazione non consentita dalla disponibilità o dalle restrizioni sui turni.",
  MISSING_ASSIGNMENT:
    "Manca un'assegnazione obbligatoria per un dipendente disponibile.",
  HARD_CONSTRAINT: "Un vincolo obbligatorio non è rispettato.",
  PUBLISHED_CHANGED: "Un'assegnazione pubblicata è stata modificata.",
  OVERLAPPING_WORK:
    "Sono presenti intervalli di lavoro sovrapposti per lo stesso dipendente.",
  FAIRNESS_MISMATCH:
    "Le quote o i debiti dichiarati non corrispondono al ricalcolo indipendente.",
  CONSOLIDATION_RANGE:
    "La data di consolidamento deve rientrare nell'orizzonte di pianificazione.",
  CONFIGURATION_MISMATCH:
    "Il risultato non appartiene esattamente alla configurazione corrente.",
  MAPPINGS:
    "Controlla le associazioni: ogni simbolo dichiarato deve riferirsi a un'entità esistente del tipo previsto.",
  REVISION:
    "Revisione non valida. CREATE parte da 1; REPLACE richiede un incremento di una sola revisione e il controllo della revisione attesa.",
  POLICY_EXISTS: "CREATE non può sovrascrivere una politica esistente.",
  POLICY_NOT_FOUND: "REPLACE richiede una politica già esistente.",
  REVISION_CONFLICT:
    "La revisione della politica è cambiata oppure manca la revisione attesa. Aggiorna il documento prima di importarlo.",
  HR_EVENT_ID:
    "Gli ID degli eventi HR devono essere univoci all'interno del documento.",
  HR_SNAPSHOT:
    "Gli eventi dell'istantanea devono avere la stessa origine e una revisione non superiore a quella dell'istantanea.",
  HR_REVISION_CONFLICT:
    "Due eventi HR con la stessa revisione hanno contenuti diversi.",
  HR_PROTECTED_CONFLICT:
    "L'assenza è in conflitto con turni pubblicati o consolidati. Esamina esplicitamente il calendario protetto.",
  INPUT_LIMIT:
    "Il documento supera i limiti di dimensione o annidamento supportati.",
  IO: "Impossibile leggere il file richiesto.",
  INTERNAL:
    "Si è verificato un errore interno. Consulta i dettagli tecnici originali.",
};

export function localizeDiagnostic(
  language: Language,
  diagnostic: { code: string; message: string },
): string {
  if (language === "en") return diagnostic.message;
  const { code, message } = diagnostic;
  const rules: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^Unknown reference: (.+)$/s, (m) => `Riferimento inesistente: ${m[1]}`],
    [/^Unknown group: (.+)$/s, (m) => `Gruppo inesistente: ${m[1]}`],
    [
      /^Cyclic group: (.+)$/s,
      (m) => `Riferimento circolare nel gruppo: ${m[1]}`,
    ],
    [/^Duplicate ID: (.+)$/s, (m) => `ID duplicato: ${m[1]}`],
    [/^Invalid date: (.+)$/s, (m) => `Data non valida: ${m[1]}`],
    [/^Invalid ISO week: (.+)$/s, (m) => `Settimana ISO non valida: ${m[1]}`],
    [
      /^(.+) has no admissible shift on (\d{4}-\d{2}-\d{2})$/s,
      (m) => `Nessun turno consentito per ${m[1]} il ${m[2]}.`,
    ],
    [
      /^Absence conflicts with protected work for (.+) on (\d{4}-\d{2}-\d{2}); review publication\/history explicitly$/s,
      (m) =>
        `L'assenza è in conflitto con un turno protetto di ${m[1]} il ${m[2]}. Esamina esplicitamente la pubblicazione o lo storico.`,
    ],
  ];
  for (const [pattern, render] of rules) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return Object.hasOwn(diagnosticSummaries, code)
    ? diagnosticSummaries[code]
    : message;
}

const adapterMessages: Record<string, string> = {
  "Unsupported action": "Operazione non supportata",
  "Two engine processes are already running":
    "Due processi del motore sono già in esecuzione",
  "Missing consolidation date": "Manca la data di consolidamento",
  "Engine process exceeded 620 seconds":
    "Il processo del motore ha superato 620 secondi",
  "Engine output exceeds 32 MiB": "L'output del motore supera 32 MiB",
  "Loopback host required": "È richiesto un indirizzo locale",
  "Cross-origin requests are not allowed":
    "Le richieste provenienti da altre origini non sono consentite",
  "Expected application/json": "È richiesto il formato application/json",
  "Request exceeds 20 MiB": "La richiesta supera 20 MiB",
  "Unknown API endpoint": "Endpoint API sconosciuto",
  "Invalid path": "Percorso non valido",
};
export function localizeError(
  language: Language,
  message: string,
  code?: string,
): string {
  if (language === "en") return message;
  if (code) return localizeDiagnostic(language, { code, message });
  if (Object.hasOwn(catalogue, message)) return catalogue[message];
  if (Object.hasOwn(adapterMessages, message)) return adapterMessages[message];
  if (message.startsWith("Cannot start engine:"))
    return (
      "Impossibile avviare il motore. Compila la CLI C++ o imposta ROSTERCORE_CLI.\n" +
      message
    );
  if (message.startsWith("Engine returned invalid JSON."))
    return "Il motore ha restituito un JSON non valido.\n" + message;
  return message;
}
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem(STORAGE) === "it" ? "it" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, "RosterCore · Planning playground");
    try {
      localStorage.setItem(STORAGE, language);
    } catch {
      /* Translation still works without browser storage. */
    }
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is missing");
  return {
    ...value,
    locale: value.language === "it" ? "it-IT" : "en-GB",
    t: ((text, values) => translate(value.language, text, values)) as Translate,
    diagnostic: (diagnostic: { code: string; message: string }) =>
      localizeDiagnostic(value.language, diagnostic),
    localizeError: (message: string, code?: string) =>
      localizeError(value.language, message, code),
  };
}
export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-selector">
      <span>{t("Language")}</span>
      <select
        aria-label="Language / Lingua"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="en">English</option>
        <option value="it">Italiano</option>
      </select>
    </label>
  );
}
