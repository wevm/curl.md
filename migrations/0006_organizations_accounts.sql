-- organizations

CREATE TABLE IF NOT EXISTS organization (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  plan               TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at         TEXT
);

CREATE INDEX idx_organization_stripe_customer_id ON organization(stripe_customer_id);

-- accounts

CREATE TABLE IF NOT EXISTS account (
  id         TEXT PRIMARY KEY,
  github_id  INTEGER NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at TEXT
);

-- organization members

CREATE TABLE IF NOT EXISTS organization_member (
  organization_id TEXT NOT NULL REFERENCES organization(id),
  account_id      TEXT NOT NULL REFERENCES account(id),
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (organization_id, account_id)
);

-- api keys

CREATE TABLE IF NOT EXISTS api_key (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organization(id),
  created_by_account_id TEXT NOT NULL REFERENCES account(id),
  key_prefix            TEXT NOT NULL,
  key_hash              TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  last_used_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at            TEXT
);

CREATE INDEX idx_api_key_organization_id ON api_key(organization_id);

-- add organization/account columns to request

ALTER TABLE request ADD COLUMN organization_id TEXT;
ALTER TABLE request ADD COLUMN api_key_id TEXT;
ALTER TABLE request ADD COLUMN account_id TEXT;
