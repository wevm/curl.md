-- accounts

CREATE TABLE IF NOT EXISTS account (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  role       TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at TEXT
);

-- account providers

CREATE TABLE IF NOT EXISTS account_provider (
  id                       TEXT PRIMARY KEY,
  account_id               TEXT NOT NULL REFERENCES account(id),
  provider                 TEXT NOT NULL,
  provider_account_id      TEXT NOT NULL,
  access_token             TEXT,
  refresh_token            TEXT,
  access_token_expires_at  TEXT,
  refresh_token_expires_at TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_account_provider_account_id ON account_provider(account_id);

-- organizations

CREATE TABLE IF NOT EXISTS organization (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at TEXT
);

-- organization members

CREATE TABLE IF NOT EXISTS organization_member (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id),
  account_id      TEXT NOT NULL REFERENCES account(id),
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(organization_id, account_id)
);

-- api keys

CREATE TABLE IF NOT EXISTS api_key (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organization(id),
  account_id            TEXT NOT NULL REFERENCES account(id),
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
