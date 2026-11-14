// GÉNÉRÉ AUTOMATIQUEMENT depuis db/schema.sql — ne pas modifier à la main.
// Regénérer : node scripts/gen-schema.mjs
export const SCHEMA_SQL = `-- ============================================================================
--  CONGLOMERAT — schéma PostgreSQL (Neon)
--  Appliqué par : npm run db:init
--  Idempotent : peut être relancé sans casser une base existante.
--  Aucune extension exigeante : uniquement des types natifs PostgreSQL.
-- ============================================================================

-- Référentiels géographiques -------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  region       TEXT NOT NULL DEFAULT '',
  intro        TEXT NOT NULL DEFAULT '',
  center_lat   DOUBLE PRECISION NOT NULL DEFAULT 0,
  center_lng   DOUBLE PRECISION NOT NULL DEFAULT 0,
  zoom         INTEGER NOT NULL DEFAULT 12,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS districts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  UNIQUE (city_id, slug)
);

CREATE TABLE IF NOT EXISTS neighborhoods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  UNIQUE (city_id, slug)
);

-- Secteurs d'activité --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'building-2',
  color       TEXT NOT NULL DEFAULT '#22C07A',
  description TEXT NOT NULL DEFAULT '',
  parent_id   UUID REFERENCES sectors(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comptes --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'company', 'moderator', 'admin', 'super_admin')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'suspended', 'deleted')),
  first_name       TEXT NOT NULL DEFAULT '',
  last_name        TEXT NOT NULL DEFAULT '',
  display_pseudonym TEXT NOT NULL DEFAULT '',
  email_verified_at TIMESTAMPTZ,
  city_id          UUID REFERENCES cities(id) ON DELETE SET NULL,
  education_level  TEXT,
  field            TEXT,
  avatar_url       TEXT,
  points           INTEGER NOT NULL DEFAULT 0,
  preferences      JSONB NOT NULL DEFAULT '{}'::jsonb,
  totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Réinitialisation de mot de passe -------------------------------------------
-- Jeton unique à usage unique : on ne stocke que son empreinte SHA-256.
CREATE TABLE IF NOT EXISTS password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS password_resets_expiry_idx ON password_resets(expires_at);

-- Entreprises ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  legal_name         TEXT NOT NULL DEFAULT '',
  description_short  TEXT NOT NULL DEFAULT '',
  description_long   TEXT NOT NULL DEFAULT '',
  founded_year       INTEGER,
  size_band          TEXT NOT NULL DEFAULT '1-10'
                     CHECK (size_band IN ('1-10', '11-50', '51-200', '201-500', '500+')),
  employees_estimate INTEGER,
  legal_status       TEXT NOT NULL DEFAULT '',
  languages          JSONB NOT NULL DEFAULT '["fr"]'::jsonb,
  city_id            UUID REFERENCES cities(id) ON DELETE SET NULL,
  district_id        UUID REFERENCES districts(id) ON DELETE SET NULL,
  neighborhood_id    UUID REFERENCES neighborhoods(id) ON DELETE SET NULL,
  address            TEXT NOT NULL DEFAULT '',
  landmark           TEXT NOT NULL DEFAULT '',
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  hours              JSONB NOT NULL DEFAULT '{}'::jsonb,
  contacts           JSONB NOT NULL DEFAULT '{}'::jsonb,
  benefits           JSONB NOT NULL DEFAULT '[]'::jsonb,
  hiring_domains     JSONB NOT NULL DEFAULT '[]'::jsonb,
  contract_types     JSONB NOT NULL DEFAULT '[]'::jsonb,
  publication_status TEXT NOT NULL DEFAULT 'published'
                     CHECK (publication_status IN ('draft', 'pending', 'published', 'suspended', 'archived')),
  verification_level INTEGER NOT NULL DEFAULT 0 CHECK (verification_level BETWEEN 0 AND 2),
  verified_at        TIMESTAMPTZ,
  verification_expires_at TIMESTAMPTZ,
  rating_avg         NUMERIC(2,1) NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  reputation_index   INTEGER,
  is_hiring          BOOLEAN NOT NULL DEFAULT FALSE,
  hiring_roles       JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_count         INTEGER NOT NULL DEFAULT 0,
  provenance         TEXT NOT NULL DEFAULT 'contribution'
                     CHECK (provenance IN ('reel', 'exemple', 'contribution', 'owner')),
  source_url         TEXT NOT NULL DEFAULT '',
  search_text        TEXT NOT NULL DEFAULT '',
  last_checked_at    TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS companies_city_idx ON companies(city_id);
CREATE INDEX IF NOT EXISTS companies_sector_city_idx ON companies(city_id, publication_status);
CREATE INDEX IF NOT EXISTS companies_status_idx ON companies(publication_status);
CREATE INDEX IF NOT EXISTS companies_search_idx ON companies(search_text);

CREATE TABLE IF NOT EXISTS company_sectors (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sector_id  UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (company_id, sector_id)
);
CREATE INDEX IF NOT EXISTS company_sectors_sector_idx ON company_sectors(sector_id);

CREATE TABLE IF NOT EXISTS company_members (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner'
             CHECK (role IN ('owner', 'editor', 'recruiter', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS company_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('view', 'phone_click', 'whatsapp_click', 'site_click', 'direction_click', 'favorite')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_events_idx ON company_events(company_id, kind, created_at);

-- Avis -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  relationship     TEXT NOT NULL
                   CHECK (relationship IN ('current_employee', 'former_employee', 'current_intern', 'former_intern', 'candidate', 'customer_partner')),
  period_label     TEXT NOT NULL DEFAULT '',
  role_label       TEXT NOT NULL DEFAULT '',
  rating_overall   NUMERIC(2,1) NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  ratings          JSONB NOT NULL DEFAULT '{}'::jsonb,
  title            TEXT NOT NULL,
  pros             TEXT NOT NULL,
  cons             TEXT NOT NULL,
  advice           TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'published', 'rejected', 'hidden')),
  moderation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_experience BOOLEAN NOT NULL DEFAULT FALSE,
  helpful_count    INTEGER NOT NULL DEFAULT 0,
  reply_body       TEXT NOT NULL DEFAULT '',
  reply_at         TIMESTAMPTZ,
  salary           JSONB,
  decision_reason  TEXT NOT NULL DEFAULT '',
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_company_idx ON reviews(company_id, status);
CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status, created_at);
CREATE INDEX IF NOT EXISTS reviews_user_idx ON reviews(user_id);
-- Un seul avis actif (publié ou en attente) par personne, entreprise et type d'expérience.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_active_idx
  ON reviews(company_id, user_id, relationship)
  WHERE status IN ('published', 'pending');

CREATE TABLE IF NOT EXISTS review_votes (
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

-- Emploi et stages -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  contract_type   TEXT NOT NULL
                  CHECK (contract_type IN ('cdi', 'cdd', 'stage_academique', 'stage_professionnel', 'stage_pre_emploi', 'freelance', 'interim')),
  description     TEXT NOT NULL DEFAULT '',
  missions        TEXT NOT NULL DEFAULT '',
  profile         TEXT NOT NULL DEFAULT '',
  education_level TEXT NOT NULL DEFAULT '',
  experience_band TEXT NOT NULL DEFAULT '',
  skills          JSONB NOT NULL DEFAULT '[]'::jsonb,
  benefits        TEXT NOT NULL DEFAULT '',
  city_id         UUID REFERENCES cities(id) ON DELETE SET NULL,
  neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL,
  salary_min      INTEGER,
  salary_max      INTEGER,
  salary_visible  BOOLEAN NOT NULL DEFAULT FALSE,
  apply_mode      TEXT NOT NULL DEFAULT 'internal'
                  CHECK (apply_mode IN ('external_url', 'email', 'internal')),
  apply_target    TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'published'
                  CHECK (status IN ('draft', 'pending', 'published', 'expired', 'closed', 'rejected')),
  scam_flags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  search_text     TEXT NOT NULL DEFAULT '',
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_offers_company_idx ON job_offers(company_id, status);
CREATE INDEX IF NOT EXISTS job_offers_status_idx ON job_offers(status, published_at);
CREATE INDEX IF NOT EXISTS job_offers_city_idx ON job_offers(city_id);
CREATE INDEX IF NOT EXISTS job_offers_search_idx ON job_offers(search_text);

CREATE TABLE IF NOT EXISTS applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_offer_id UUID NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL DEFAULT '',
  cv_url       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'received'
               CHECK (status IN ('received', 'reviewing', 'shortlisted', 'interview', 'rejected', 'hired')),
  company_note TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_offer_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_trackers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  job_offer_id UUID REFERENCES job_offers(id) ON DELETE SET NULL,
  free_label   TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'to_review'
               CHECK (status IN ('to_review', 'prepared', 'sent', 'waiting', 'interview', 'accepted', 'rejected')),
  note         TEXT NOT NULL DEFAULT '',
  remind_at    DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_trackers_user_idx ON user_trackers(user_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('company', 'job')),
  target_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency  TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('instant', 'daily', 'weekly')),
  channels   JSONB NOT NULL DEFAULT '["site"]'::jsonb,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contributions, signalements ------------------------------------------------
CREATE TABLE IF NOT EXISTS contributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('new_company', 'edit_company')),
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT NOT NULL DEFAULT '',
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contributions_status_idx ON contributions(status, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type  TEXT NOT NULL CHECK (target_type IN ('company', 'review', 'offer')),
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT NOT NULL DEFAULT '',
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at);

-- Monétisation (démo) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  period     TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly')),
  price_xaf  INTEGER NOT NULL,
  features   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id         UUID REFERENCES plans(id) ON DELETE SET NULL,
  provider        TEXT NOT NULL DEFAULT 'demo',
  provider_ref    TEXT NOT NULL UNIQUE,
  amount_xaf      INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'XAF',
  channel         TEXT NOT NULL CHECK (channel IN ('mtn', 'orange')),
  status          TEXT NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'refunded')),
  buyer_name      TEXT NOT NULL DEFAULT '',
  buyer_email     TEXT NOT NULL DEFAULT '',
  raw_event       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, created_at);

-- Système --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email   TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  object_type   TEXT NOT NULL DEFAULT '',
  object_id     TEXT NOT NULL DEFAULT '',
  before        JSONB,
  after         JSONB,
  ip_prefix     TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,
  ip_hash    TEXT NOT NULL DEFAULT '',
  succeeded  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts(email_hash, created_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  role_title  TEXT NOT NULL,
  work_email  TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  proof_note  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export default SCHEMA_SQL;
