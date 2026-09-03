# Testing Chapa sandbox payments locally

Chapa's webhook needs a real, public https:// URL to POST to -- `localhost`
can't receive it, and `return_url` alone is never trusted to confirm a
payment (see `backend/apps/payments/services.py`). We use a free ngrok
static domain for this: unlike a Cloudflare Quick Tunnel, it's a fixed URL
that's yours permanently and never rotates, so this is one-time setup, not
something you re-run every session.

## One-time setup

1. Sign up free at https://ngrok.com. Copy your authtoken from the
   dashboard ("Your Authtoken" on the getting-started page).
2. Reserve your free static domain: dashboard > **Universal Edge >
   Domains** > **+ New Domain**. You get one for free, something like
   `your-name.ngrok-free.app`.
3. Create a **`.env` file in the repo root** (this is separate from
   `backend/.env` -- this one is read by `docker-compose.yml` itself for
   `${NGROK_AUTHTOKEN}` / `${NGROK_STATIC_DOMAIN}` substitution):
   ```
   NGROK_AUTHTOKEN=<your authtoken>
   NGROK_STATIC_DOMAIN=<your-name>.ngrok-free.app
   ```
4. In `backend/.env`, set:
   ```
   PUBLIC_API_BASE_URL=https://<your-name>.ngrok-free.app
   ```
5. In the Chapa dashboard (profile settings > **Webhooks**), set:
   - **Webhook URL**: `https://<your-name>.ngrok-free.app/api/v1/payments/webhooks/chapa/`
   - **Secret hash**: must exactly match `CHAPA_WEBHOOK_SECRET` in
     `backend/.env`, or `verify_webhook_signature()` will reject every
     webhook with a 401 that looks identical to "nothing happened" from
     the frontend.

Steps 3-5 are done once, ever. No further syncing required.

## Everyday use

```bash
docker compose up -d --force-recreate api   # picks up PUBLIC_API_BASE_URL
docker compose --profile tunnel up -d ngrok
```

Then start a fresh booking, click **Pay Now**, and complete the test
payment on Chapa's checkout page. Watch `docker compose logs api -f` for
the incoming `POST /api/v1/payments/webhooks/chapa/`.

## If it still doesn't confirm

- `docker compose logs ngrok` -- confirm the tunnel actually came up and
  is forwarding to `http://api:8000`.
- Open `https://<your-name>.ngrok-free.app/api/v1/payments/webhooks/chapa/`
  directly in a browser. You should get a Django "405 Method Not Allowed"
  page. If the domain doesn't resolve or times out, the `ngrok` container
  isn't running or `NGROK_STATIC_DOMAIN`/`NGROK_AUTHTOKEN` are wrong.
- Any booking created *before* `PUBLIC_API_BASE_URL` was set correctly has
  the wrong `callback_url` baked into its Chapa checkout session
  permanently -- it can never confirm. Always test with a brand-new
  booking after a config change.
