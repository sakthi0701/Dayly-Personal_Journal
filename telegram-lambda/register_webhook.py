"""
register_webhook.py
===================
One-time script to register your Vercel app as the Telegram webhook.
Run this ONCE from your local machine after deploying to Vercel.

Usage:
    python register_webhook.py

Requirements:
    - Python 3.6+ (uses only stdlib)
    - TELEGRAM_BOT_TOKEN set in your environment (or edit the constants below)
    - Your Vercel app must be deployed first
"""

import json
import urllib.request
import os

# ── Config ───────────────────────────────────────────────────────────────────
# Edit these or set them as environment variables
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8633755254:AAHzThpxp04eESMME_Nv0uksULh9Qs6apBQ")
VERCEL_URL = os.environ.get("VERCEL_URL", "https://dayly7.vercel.app")  # Your Vercel app URL

# The webhook endpoint in your Next.js app
WEBHOOK_URL = f"{VERCEL_URL}/api/telegram"
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


def api_call(method: str, data: dict = None) -> dict:
    url = f"{TELEGRAM_API}/{method}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST" if body else "GET",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    # 1. Delete any existing webhook (clears polling mode conflicts)
    print("Clearing existing webhook...")
    result = api_call("deleteWebhook", {"drop_pending_updates": True})
    print(f"  deleteWebhook: {'✅' if result.get('ok') else '❌'} {result.get('description', '')}")

    # 2. Register the new webhook
    print(f"\nRegistering webhook → {WEBHOOK_URL}")
    result = api_call("setWebhook", {
        "url": WEBHOOK_URL,
        "allowed_updates": ["message"],
        "drop_pending_updates": True,
    })

    if result.get("ok"):
        print(f"  ✅ Webhook registered successfully!")
    else:
        print(f"  ❌ Failed: {result}")
        return

    # 3. Verify
    print("\nVerifying webhook info...")
    info = api_call("getWebhookInfo")
    wi = info.get("result", {})
    print(f"  URL:            {wi.get('url')}")
    print(f"  Pending:        {wi.get('pending_update_count', 0)}")
    print(f"  Last error:     {wi.get('last_error_message', 'none')}")
    print(f"\n🚀 Done! Telegram will now push updates to your Vercel app.")
    print(f"   You can delete the local telegram-bot/ polling script — it's no longer needed.")


if __name__ == "__main__":
    main()
