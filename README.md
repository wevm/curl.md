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

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

* `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID (found in the Workers dashboard URL)
* `CLOUDFLARE_API_TOKEN` - Cloudflare API token for deployments (see [below](#creating-a-cloudflare-api-token))
* `COOKIE_SECRET` - Secret for signing session cookies
* `GH_CLIENT_ID` - GitHub App client ID (see [GitHub App Setup](#github-app-setup))
* `GH_CLIENT_SECRET` - GitHub App client secret (see [GitHub App Setup](#github-app-setup))

### Creating a Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens)
2. Click "Create Token"
3. Select "Create Custom Token"
4. Add these permissions:
   - **Account** → **D1** → **Edit**
   - **Account** → **Workers Scripts** → **Edit**
   - **Account** → **Browser Rendering** → **Edit**
   - **Account** → **Workers AI** → **Edit**
   - **Zone** → **Workers Routes** → **Edit**
   - **Zone** → **Zone** → **Edit**
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

### WWW Redirect

Redirect `www.curl.md` to `curl.md` (non-www canonical) via [Bulk Redirects](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/):

1. Go to [DNS Records](https://dash.cloudflare.com/?to=/:account/:zone/dns/records) for the `curl.md` zone
2. Add a proxied A record: `www` → `192.0.2.1` (placeholder; the redirect fires before it's reached)
3. Go to [Bulk Redirects](https://dash.cloudflare.com/?to=/:account/bulk-redirects)
4. Create a bulk redirect list with: `www.curl.md` → `https://curl.md` (301, preserve query string, subpath matching, preserve path suffix)
