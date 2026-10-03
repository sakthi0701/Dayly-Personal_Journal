"""
deadline_cron.py — AWS Lambda Function
=======================================
Cron job that checks for tasks and pressure tasks whose deadline is TODAY
and sends a Telegram reminder asking if they were completed.

Deploy this as a separate Lambda function and trigger it with EventBridge
on a cron schedule (e.g., 6:30 PM IST = 13:00 UTC every day).

Environment Variables (set in Lambda → Configuration → Environment variables):
    TELEGRAM_BOT_TOKEN   Your bot token from BotFather
    TELEGRAM_CHAT_ID     Your numeric Telegram chat ID
    SUPABASE_URL         https://your-project.supabase.co
    SUPABASE_ANON_KEY    Your Supabase anon/public key

Zero external dependencies — uses only Python stdlib (urllib).
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# ── IST timezone ──────────────────────────────────────────────────────────────
IST = timezone(timedelta(hours=5, minutes=30))


def send_telegram(token: str, chat_id: str, text: str) -> bool:
    """Send a Telegram message. Returns True on success."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return body.get("ok", False)
    except Exception as e:
        print(f"[Telegram] Error sending message: {e}")
        return False


def supabase_get(supabase_url: str, anon_key: str, table: str, params: dict) -> list:
    """
    Minimal Supabase REST GET helper.
    Returns the list of rows, or [] on error.
    """
    query_string = "&".join(
        f"{urllib.parse.quote(k)}={urllib.parse.quote(str(v))}"
        for k, v in params.items()
    )
    url = f"{supabase_url}/rest/v1/{table}?{query_string}"

    req = urllib.request.Request(
        url,
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[Supabase] Error querying {table}: {e}")
        return []


def get_today_ist() -> str:
    """Returns today's date in IST as YYYY-MM-DD."""
    return datetime.now(IST).strftime("%Y-%m-%d")


def lambda_handler(event, context):
    # ── Load credentials ─────────────────────────────────────────────────────
    BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
    CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

    if not all([BOT_TOKEN, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY]):
        print("[ERROR] Missing required environment variables.")
        return {"statusCode": 500, "body": "Missing environment variables"}

    today = get_today_ist()
    now_ist = datetime.now(IST)
    print(f"[Cron] Running deadline check for {today} ({now_ist.strftime('%H:%M IST')})")

    # ── Query regular tasks with today's deadline ─────────────────────────────
    tasks = supabase_get(
        SUPABASE_URL, SUPABASE_ANON_KEY,
        "tasks",
        {
            "select": "id,title,status,estimated_pomodoros,elapsed_pomodoros",
            "due_date": f"eq.{today}",
            "status": "in.(todo,in-progress)",
            "parent_task_id": "is.null",
            "order": "priority.asc",
        }
    )

    # ── Query pressure tasks with today's deadline ────────────────────────────
    pressure_tasks = supabase_get(
        SUPABASE_URL, SUPABASE_ANON_KEY,
        "pressure_tasks",
        {
            "select": "id,title,priority,status,estimated_minutes",
            "deadline": f"eq.{today}",
            "status": "in.(todo,snoozed)",
            "order": "priority.asc",
        }
    )

    # ── Also check OVERDUE tasks (deadline < today, still open) ──────────────
    overdue_pressure = supabase_get(
        SUPABASE_URL, SUPABASE_ANON_KEY,
        "pressure_tasks",
        {
            "select": "id,title,priority,deadline",
            "deadline": f"lt.{today}",
            "status": "in.(todo,snoozed)",
            "order": "deadline.asc",
            "limit": "5",
        }
    )

    # ── Build message ─────────────────────────────────────────────────────────
    if not tasks and not pressure_tasks and not overdue_pressure:
        msg = (
            f"✅ *Deadline Check — {today}*\n\n"
            "No tasks or pressure tasks due today. Great work staying on top of things! 🎯"
        )
    else:
        lines = [f"⏰ *Deadline Check — {today}*\n"]

        if tasks:
            lines.append("📌 *Tasks due today:*")
            for t in tasks:
                pomo = (
                    f" _({t.get('elapsed_pomodoros', 0)}/{t.get('estimated_pomodoros', 0)} 🍅)_"
                    if t.get("estimated_pomodoros")
                    else ""
                )
                lines.append(f"  • {t['title']}{pomo}")
            lines.append("")

        if pressure_tasks:
            lines.append("⚡ *Pressure tasks due today:*")
            for t in pressure_tasks:
                urgency = "🔴" if t.get("priority", 3) <= 1 else "🟠" if t.get("priority", 3) <= 2 else "🟡"
                mins = f" _(~{t['estimated_minutes']}m)_" if t.get("estimated_minutes") else ""
                lines.append(f"  {urgency} {t['title']}{mins}")
            lines.append("")

        if overdue_pressure:
            lines.append("⚠️ *Overdue pressure tasks:*")
            for t in overdue_pressure:
                dl = t.get("deadline", "?")
                lines.append(f"  🔴 {t['title']} _(was due {dl})_")
            lines.append("")

        total = len(tasks) + len(pressure_tasks)
        lines.append(
            f"Did you complete these? Reply `/tasks` or `/pressure` to update, "
            f"or `/journal` to reflect on your progress. 💪"
        )

        msg = "\n".join(lines)

    # ── Send ──────────────────────────────────────────────────────────────────
    success = send_telegram(BOT_TOKEN, CHAT_ID, msg)
    print(f"[Cron] Message sent: {'✅' if success else '❌'}")

    return {
        "statusCode": 200 if success else 500,
        "body": json.dumps({
            "tasks_due": len(tasks),
            "pressure_due": len(pressure_tasks),
            "overdue": len(overdue_pressure),
            "sent": success,
        }),
    }
