-- Ottimizzazione in stile Optmyzr: regole automatiche, suggerimenti da approvare e storico modifiche.

CREATE TABLE IF NOT EXISTS rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  -- NULL = la regola vale per tutti i clienti dell'agenzia.
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE,
  name           text NOT NULL,
  -- [{"metric":"spend","op":">","value":50}, ...] in AND, vedi src/lib/rules/types.ts
  conditions     jsonb NOT NULL,
  lookback_days  smallint NOT NULL CHECK (lookback_days BETWEEN 1 AND 90),
  -- {"type":"pause"} | {"type":"activate"} | {"type":"alert"} | {"type":"budget","pct":-20}
  action         jsonb NOT NULL,
  -- suggest: crea un suggerimento da approvare; auto: applica subito su OpenAI.
  mode           text NOT NULL DEFAULT 'suggest' CHECK (mode IN ('suggest', 'auto')),
  enabled        boolean NOT NULL DEFAULT true,
  last_run_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rules_agency_idx ON rules(agency_id);

CREATE TABLE IF NOT EXISTS suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rule_id      uuid REFERENCES rules(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action       jsonb NOT NULL,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'failed')),
  error        text,
  decided_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Una regola non ripropone lo stesso suggerimento finché quello aperto non viene deciso.
CREATE UNIQUE INDEX IF NOT EXISTS suggestions_open_idx ON suggestions(rule_id, campaign_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS suggestions_agency_idx ON suggestions(agency_id, status);

CREATE TABLE IF NOT EXISTS change_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id  uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  -- user: dalla piattaforma; rule: regola in modalità auto; openai: letto da GET /audit_logs.
  source       text NOT NULL CHECK (source IN ('user', 'rule', 'openai')),
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  rule_id      uuid REFERENCES rules(id) ON DELETE SET NULL,
  -- ID dell'audit log OpenAI: evita doppioni quando il sync rilegge gli stessi giorni.
  external_id  text UNIQUE,
  summary      text NOT NULL,
  details      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS change_log_agency_idx ON change_log(agency_id, created_at DESC);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
