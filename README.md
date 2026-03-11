# curl.md

Fetch any URL as Markdown 

## Development

```bash
# Install and start OrbStack
brew install orbstack
orb start

# Set up environment
cp .env.example .env

# Start dev container
docker compose up -d

# Request or open in browser
curl curl.local/example.com
open https://curl.local
```

OrbStack automatically resolves `curl.local` requests to the container.

## Deploy

### GitHub Actions Secrets

Secrets are managed via [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) and repo-level secrets.

**Repository secrets** ([Settings → Secrets and variables → Actions](https://github.com/wevm/curl.md/settings/secrets/actions)) — shared across all environments:

* `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID (found in the Workers dashboard URL)
* `CLOUDFLARE_API_TOKEN` - Cloudflare API token for deployments (see [below](#creating-a-cloudflare-api-token))
* `COOKIE_SECRET` - Secret for signing session cookies (`openssl rand -base64 32`)
* `GH_CLIENT_ID` - GitHub App client ID (see [GitHub App Setup](#github-app-setup))
* `GH_CLIENT_SECRET` - GitHub App client secret (see [GitHub App Setup](#github-app-setup))
* `SENTRY_DSN` - Sentry DSN for error tracking (see [Sentry](#sentry))
* `TOKEN_ENCRYPTION_KEY` - Base64-encoded 256-bit key for encrypting OAuth tokens (`openssl rand -base64 32`)

**`production` environment** ([Settings → Environments → `production`](https://github.com/wevm/curl.md/settings/environments/12871461617/edit)):

* `DB_URL` - PlanetScale Postgres connection string (for production migrations)
* `STRIPE_SECRET_KEY` - Stripe live secret key (see [Stripe Setup](#stripe-setup))
* `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (see [Stripe Setup](#stripe-setup))

### PlanetScale

1. Create a [PlanetScale](https://planetscale.com) account and organization
2. Create a new database with the **Postgres** engine:
   ```bash
   pscale database create curl --region <REGION_SLUG> --engine postgres
   ```
3. Create two roles on the `main` branch:
   - **App role** (for Hyperdrive/production) — select `pg_read_all_data` + `pg_write_all_data`
   - **Migrations role** (for CI) — select `postgres` (full DDL access for `kysely migrate`)
4. Record the connection strings (`postgres://<user>:<password>@<host>:5432/postgres?sslmode=require`)

### Cloudflare Hyperdrive

Connect PlanetScale to Cloudflare Workers via [Hyperdrive](https://developers.cloudflare.com/hyperdrive/):

1. Go to [Hyperdrive](https://dash.cloudflare.com/?to=/:account/workers/hyperdrive) in the Cloudflare dashboard
2. Click "Create Configuration"
3. Paste the PlanetScale connection string
4. Copy the Hyperdrive ID into `wrangler.jsonc` under `env.production.hyperdrive[0].id`

### Creating a Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens)
2. Click "Create Token"
3. Select "Create Custom Token"
4. Add these permissions:
   - **Account** → **Browser Rendering** → **Edit**
   - **Account** → **Workers AI** → **Edit**
   - **Account** → **Queues** → **Edit**
   - **Account** → **Hyperdrive** → **Edit**
   - **Account** → **Workers KV Storage** → **Edit**
   - **Account** → **Workers Scripts** → **Edit**
   - **Zone** → **Workers Routes** → **Edit**
5. Set Account Resources to your account
6. Set Zone Resources to your domain (e.g., `curl.md`)
7. Click "Continue to summary" → "Create Token"

### GitHub App Setup

1. Go to [GitHub Developer Settings → GitHub Apps](https://github.com/organizations/wevm/settings/apps)
2. Click "New GitHub App"
3. Fill in:
   - **GitHub App name**: `curl.md`
   - **Homepage URL**: `https://curl.md`
   - **Callback URL**: `https://curl.md/api/auth/github/callback`
   - Check "Expire user authorization tokens"
   - Check "Enable Device Flow" (for CLI authentication)
   - Uncheck "Active" under Webhook (not needed)
   4. Under Permissions:
   - **Account permissions** → **Email addresses** → Read-only
5. Click "Create GitHub App"
6. Copy the **Client ID** → `GH_CLIENT_ID` in `.env`
7. Click "Generate a new client secret" → `GH_CLIENT_SECRET` in `.env`

### Stripe Setup

Stripe powers prepaid credit billing. A single Stripe account is used with test mode for development and live mode for production.

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Copy your **Secret key** from [API keys](https://dashboard.stripe.com/test/apikeys) → `STRIPE_SECRET_KEY` in `.env`
3. Set callback webhook URL and get webhook secret:
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) → "Add endpoint"
   - Set URL to `https://curl.md/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `charge.dispute.created`, `charge.refunded`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

### Sentry

Error tracking for both server-side (Worker: API, queues, crons) and client-side (React).

1. Create a [Sentry](https://sentry.io) project (JavaScript / Cloudflare)
2. Copy the **DSN** from Project Settings → Client Keys (DSN)

### WWW Redirect

Redirect `www.curl.md` to `curl.md` (non-www canonical) via [Bulk Redirects](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/):

1. Go to [DNS Records](https://dash.cloudflare.com/?to=/:account/:zone/dns/records) for the `curl.md` zone
2. Add a proxied A record: `www` → `192.0.2.1` (placeholder; the redirect fires before it's reached)
3. Go to [Bulk Redirects](https://dash.cloudflare.com/?to=/:account/bulk-redirects)
4. Create a bulk redirect list with: `www.curl.md` → `https://curl.md` (301, preserve query string, subpath matching, preserve path suffix)

## Preview

Preview environments deploy per PR with isolated PlanetScale database branches and Cloudflare Hyperdrive configs. On PR close/draft, cleanup deletes the Worker, Hyperdrive config, PlanetScale branch, KV namespace, Queues, and Stripe webhook. A daily sweep catches orphans.

### GitHub Environments

Preview secrets are scoped via [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) ([Settings → Environments → `preview`](https://github.com/wevm/curl.md/settings/environments/12873481464/edit)). Add the following secrets to the `preview` environment:

* `PLANETSCALE_SERVICE_TOKEN` — PlanetScale service token (see [PlanetScale Branching](#planetscale-branching))
* `PLANETSCALE_SERVICE_TOKEN_ID` — PlanetScale service token ID (see [PlanetScale Branching](#planetscale-branching))
* `PLANETSCALE_ORG` — PlanetScale organization slug (e.g. `wevm`)
* `PLANETSCALE_DB` — PlanetScale database name (same as production, e.g. `curl`)
* `STRIPE_SECRET_KEY` — Stripe test mode secret key (see [Stripe](#stripe-1))

### PlanetScale Branching

1. Create a [service token](https://app.planetscale.com/~/settings/service-tokens) in PlanetScale with the following access on your database:
   - `create_branch`
   - `delete_branch`
   - `read_branch`
   - `connect_branch`
2. Add these secrets to the `preview` environment:
   - `PLANETSCALE_SERVICE_TOKEN` — the token value
   - `PLANETSCALE_SERVICE_TOKEN_ID` — the token ID
   - `PLANETSCALE_ORG` — your PlanetScale organization slug (e.g. `wevm`)
   - `PLANETSCALE_DB` — your database name (same as production, e.g. `curl`)

### Stripe

Preview environments use Stripe **test mode** keys so no real charges occur.

1. Copy your **test mode** secret key from [API keys](https://dashboard.stripe.com/test/apikeys)
2. Add to the `preview` environment:
   - `STRIPE_SECRET_KEY` — Stripe test mode secret key (starts with `sk_test_`)

## License

[FSL-1.1-MIT](LICENSE)
