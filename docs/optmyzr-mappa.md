# Da Optmyzr a LLMAds

Mappa delle funzioni di [Optmyzr](https://www.optmyzr.com/) (strumento multi-account per Google Ads) e di come le replichiamo su ChatGPT Ads con l'[OpenAI Advertiser API](https://developers.openai.com/ads).
Fonti: pagine pubbliche di Optmyzr (soluzioni Monitoring, Automation, Budget Management, PPC Audits, Reporting) e Help Center (Rule Engine). Nessun codice o materiale di Optmyzr è stato copiato: riprendiamo la struttura del prodotto, non l'implementazione.

| Optmyzr | Cosa fa | Equivalente LLMAds | API OpenAI usata | Stato |
| --- | --- | --- | --- | --- |
| Account Dashboard | Tutti i clienti in una tabella: spesa, budget, KPI | Dashboard `/` | `GET /ad_account`, `/campaigns`, `/ad_account/insights` | Fatto (passo 2) |
| Budget Pacing / Budget Monitors | Spesa del mese, previsione, avvisi sovra/sottospesa | Barra budget + avvisi 80/95% + pagina cliente con spesa giornaliera consigliata ("Reach Target Monthly Spend") | insights giornalieri | Fatto |
| Rule Engine | Strategie con condizioni su metriche e periodo, azioni (pausa, budget, solo report), anteprima, esecuzione programmata o manuale | `/regole`: condizioni in AND su 7 metriche, periodo 1-90 giorni, azioni pausa/riattiva/budget ±50%/solo avviso, anteprima, modalità "suggerisci" o "automatica", gira dopo ogni sync | `POST /campaigns/{id}/pause`, `/activate`, `POST /campaigns/{id}` | Fatto |
| Blueprints | Regole pronte | 4 modelli pronti in `/regole` | – | Fatto |
| Alerts / Suggestions | Notifiche e modifiche da approvare | `/avvisi`: avvisi di budget e suggerimenti con Applica/Ignora | come sopra | Fatto (email/Slack: passo successivo) |
| PPC Audit | Voto all'account e lista di problemi | `/audit`: voto A-F e controlli su revisione, sync, budget, consegna, conversioni, CTR, scadenze | dati sincronizzati | Fatto |
| Cause Chart / PPC Investigator | Spiega perché una metrica è cambiata | Investigatore nella pagina cliente: clic = impression × CTR, spesa = clic × CPC, conversioni = clic × tasso, per 7/14/30 giorni, con dettaglio per campagna | insights giornalieri | Fatto |
| Change History | Chi ha cambiato cosa | `/storico`: modifiche dalla piattaforma, dalle regole e da Ads Manager | `GET /audit_logs` | Fatto |
| One-click optimizations | Applicare le modifiche dalla stessa pagina | Pausa/Riattiva/Budget ±10% nella pagina cliente | come Rule Engine | Fatto |
| Reports / Scheduled reporting | Report PDF e link condivisibili programmati | – | insights | Prossimo passo |
| Ad Text Optimization / AI Sidekick | Suggerimenti di testo con LLM | – | `/ads`, `/files` | Dopo i report |
| Search Terms / N-Gram / Negative Keywords | Analisi delle query | Non applicabile: ChatGPT Ads non espone query né keyword negative | – | – |
| Shopping / Feed audit, Amazon, Social | Canali specifici | Non applicabile per ora | – | – |

## Limiti dell'API da tenere presenti

- Una chiave per account, nessun accesso "MCC": ogni cliente va collegato con la sua chiave.
- Non esistono parole chiave né termini di ricerca: le leve sono budget, stato della campagna, offerte e annunci.
- Le conversioni arrivano con almeno un giorno di ritardo: l'investigatore confronta giorni completi, fino a ieri.
- In modalità `mock` le modifiche rispondono come l'API vera ma il sync successivo riporta i dati finti allo stato iniziale.
