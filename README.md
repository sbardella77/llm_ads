# LLMAds

Piattaforma per agenzie che gestiscono le campagne **ChatGPT Ads** di più clienti da un'unica dashboard.
Stack: Next.js su Vercel, Postgres su Neon, [OpenAI Advertiser API](https://developers.openai.com/ads).

## Come funziona

- Ogni cliente ha uno o più account ChatGPT Ads. OpenAI rilascia **una chiave API per account**: la salviamo cifrata (AES-256-GCM) in `ad_accounts`.
- Un job su Vercel Cron (`/api/cron/sync`) scarica campagne e insights giornalieri degli ultimi 35 giorni e li salva su Neon.
- La dashboard legge solo da Neon e mostra spesa, budget, previsione di fine mese, clic, CTR, CPC, conversioni e CPA per cliente.
- Quando un cliente supera l'80% o il 95% del budget mensile il sync registra un avviso in `alerts` (l'invio email arriva nel passo 3).
- Login con email e password: password con scrypt, sessioni lato server (nel cookie c'è solo un token casuale, nel DB il suo hash). Ogni utente vede solo i clienti della propria agenzia.
- In questa fase la piattaforma **legge e basta**: non modifica nulla negli account dei clienti.

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `db/migrations/` | Schema SQL |
| `src/lib/openai-ads/` | Adapter OpenAI Ads: client HTTP reale e `MockAdsApi` con dati finti |
| `src/lib/sync.ts` | Sincronizzazione account → Neon e avvisi di budget |
| `src/lib/budget.ts` | Calcoli di budget e previsione (funzioni pure, testate) |
| `src/app/page.tsx` | Dashboard multi-cliente |
| `src/lib/auth/`, `src/app/login/` | Login, sessioni e logout |
| `tests/` | Test unitari e test di integrazione su Postgres in memoria (PGlite) |

## Sviluppo

```bash
cp .env.example .env.local   # oppure: vercel env pull .env.local
npm install
npm run db:migrate           # applica lo schema
npm run db:seed              # agenzia demo con 4 clienti finti + primo sync, stampa il login demo
npm run user:create -- "Nome Agenzia" email@agenzia.it "Nome" "password-lunga"
npm run dev
npm test
```

Con `ADS_API_MODE=mock` (o con chiavi che iniziano per `mock_`) l'app usa dati finti con la stessa forma delle risposte dell'API OpenAI.
Per un account vero: `ADS_API_MODE=live` e la chiave creata in Ads Manager → Settings.

## Deploy su Vercel

1. Importa il repository su Vercel.
2. Variabili d'ambiente: `DATABASE_URL` (progetto Neon `llmads`), `ENCRYPTION_KEY` (`openssl rand -base64 32`), `CRON_SECRET` (`openssl rand -hex 32`), `ADS_API_MODE=mock`.
3. Il cron in `vercel.json` gira una volta al giorno (limite del piano Hobby). Sul piano Pro si può passare a ogni ora: `"0 * * * *"`.
