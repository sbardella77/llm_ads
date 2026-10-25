-- LLMAds: schema iniziale multi-agenzia.
-- Importi in micro-unità (1.000.000 = 1 unità di valuta), come li usa l'API OpenAI Ads.

CREATE TABLE IF NOT EXISTS agencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  currency    char(3) NOT NULL DEFAULT 'EUR',
  timezone    text NOT NULL DEFAULT 'Europe/Rome',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'manager')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  monthly_budget_micros bigint NOT NULL CHECK (monthly_budget_micros >= 0),
  alert_thresholds      smallint[] NOT NULL DEFAULT '{80,95}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_agency_idx ON clients(agency_id);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  openai_account_id   text NOT NULL,
  name                text NOT NULL,
  currency_code       char(3) NOT NULL,
  timezone            text NOT NULL,
  status              text,
  review_status       text,
  -- Chiave API cifrata con AES-256-GCM (vedi src/lib/crypto.ts). Mai salvata in chiaro.
  api_key_ciphertext  bytea NOT NULL,
  api_key_iv          bytea NOT NULL,
  api_key_tag         bytea NOT NULL,
  api_key_last4       text NOT NULL,
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, openai_account_id)
);
CREATE INDEX IF NOT EXISTS ad_accounts_client_idx ON ad_accounts(client_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  ad_account_id       uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  openai_campaign_id  text NOT NULL,
  name                text NOT NULL,
  status              text NOT NULL,
  budget_type         text CHECK (budget_type IN ('daily', 'lifetime')),
  budget_micros       bigint,
  start_time          timestamptz,
  end_time            timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, openai_campaign_id)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  ad_account_id  uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date           date NOT NULL,
  impressions    bigint NOT NULL DEFAULT 0,
  clicks         bigint NOT NULL DEFAULT 0,
  spend_micros   bigint NOT NULL DEFAULT 0,
  conversions    numeric(14, 2),
  synced_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, date)
);
CREATE INDEX IF NOT EXISTS daily_metrics_account_date_idx ON daily_metrics(ad_account_id, date);

CREATE TABLE IF NOT EXISTS alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_month   date NOT NULL,
  threshold      smallint NOT NULL,
  spend_micros   bigint NOT NULL,
  budget_micros  bigint NOT NULL,
  recipients     text[] NOT NULL DEFAULT '{}',
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Un solo avviso per cliente, mese e soglia: il sync può girare più volte senza duplicati.
  UNIQUE (client_id, period_month, threshold)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  ad_account_id  uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  rows_upserted  integer NOT NULL DEFAULT 0,
  error          text
);
CREATE INDEX IF NOT EXISTS sync_runs_account_idx ON sync_runs(ad_account_id, started_at DESC);
