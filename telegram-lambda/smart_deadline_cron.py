"""
smart_deadline_cron.py — AWS Lambda Function
=============================================
Runs every 30 minutes via EventBridge: `*/30 * * * ? *`

Reminder logic:
  - Tasks/pressure tasks with a DATE-only deadline (day deadline):
      • Morning reminder at 7:00 AM IST  → "You have X tasks due today!"
      • Evening follow-up at 9:00 PM IST → "You still haven't completed these!" (only if still open)

  - Pressure tasks with a DATETIME deadline (specific time, e.g. "2026-10-05T14:30:00"):
      • Reminder fires when the current 30-minute window contains that time
        e.g. deadline 2:30 PM → fires in the 2:00–2:29 or 2:30–2:59 window (whichever slot matches)

AWS EventBridge cron expression: `*/30 * * * ? *`  (every 30 minutes, UTC)

Environment Variables (Lambda → Configuration → Environment variables):
    TELEGRAM_BOT_TOKEN   Your bot token
    TELEGRAM_CHAT_ID     Your numeric chat ID
    SUPABASE_URL         https://your-project.supabase.co
    SUPABASE_ANON_KEY    Your Supabase anon key

Zero external dependencies — uses only Python stdlib.
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# ── IST timezone ──────────────────────────────────────────────────────────────
IST = timezone(timedelta(hours=5, minutes=30))

# ── Slot windows (IST hour, minute start of 30-min window) ───────────────────
MORNING_SLOT_HOUR   = 7   # 7:00 AM IST
EVENING_SLOT_HOUR   = 21  # 9:00 PM IST
SLOT_DURATION_MINS  = 30  # Lambda runs every 30 min

# ─── Telegram helper ──────────────────────────────────────────────────────────

def send_telegram(token: str, chat_id: str, text: str) -> bool:
    """Send a Telegram message. Returns True on success."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return body.get("ok", False)
    except Exception as e:
        print(f"[Telegram] Error: {e}")
        return False


# ─── Supabase REST helper ─────────────────────────────────────────────────────

def supabase_get(supabase_url: str, anon_key: str, table: str, params: dict) -> list:
    """Minimal Supabase REST GET. Returns list of rows or [] on error."""
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
            "Prefer": "return=representation",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[Supabase] Error querying {table}: {e}")
        return []


# ─── Deadline parsing ─────────────────────────────────────────────────────────

def parse_deadline(raw: str):
    """
    Parse a Supabase deadline/due_date string.

    Returns:
        (date_only: bool, dt: datetime in IST)

    Handles:
        "2026-10-05"              → date only  (7 AM + 9 PM reminders)
        "2026-10-05T14:30:00"     → has time   (fire at 14:30 IST)
        "2026-10-05T14:30:00+05:30" → has time with tz offset
        "2026-10-05T09:00:00+00:00" → UTC with tz, converted to IST
    """
    if not raw:
        return True, None

    raw = raw.strip()

    # Pure date: "YYYY-MM-DD"
    if len(raw) == 10 and "T" not in raw:
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=IST)
            return True, dt
        except ValueError:
            return True, None

    # DateTime string — try multiple formats
    formats = [
        "%Y-%m-%dT%H:%M:%S%z",       # with tz offset
        "%Y-%m-%dT%H:%M:%S",          # no tz (assume IST)
        "%Y-%m-%dT%H:%M%z",           # no seconds, with tz
        "%Y-%m-%dT%H:%M",             # no seconds, no tz (assume IST)
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=IST)
            else:
                dt = dt.astimezone(IST)
            return False, dt  # has specific time
        except ValueError:
            continue

    # Could not parse — treat as date-only
    print(f"[Parse] Could not parse deadline: {raw!r} — treating as day-only")
    return True, None


# ─── Slot detection ───────────────────────────────────────────────────────────

def get_current_slot(now_ist: datetime):
    """
    Returns the current 30-minute slot start as a datetime,
    and whether this is the morning or evening reminder slot.
    """
    # Round down to nearest 30-min boundary
    slot_start = now_ist.replace(
        minute=(now_ist.minute // 30) * 30,
        second=0,
        microsecond=0,
    )
    slot_end = slot_start + timedelta(minutes=SLOT_DURATION_MINS)

    is_morning = slot_start.hour == MORNING_SLOT_HOUR
    is_evening = slot_start.hour == EVENING_SLOT_HOUR

    return slot_start, slot_end, is_morning, is_evening


def deadline_in_slot(deadline_dt: datetime, slot_start: datetime, slot_end: datetime) -> bool:
    """True if deadline time falls within the current 30-minute window."""
    return slot_start <= deadline_dt < slot_end


# ─── Message builders ─────────────────────────────────────────────────────────

def format_task_line(title: str, pomo_elapsed=None, pomo_est=None, mins=None, priority=None, overdue_date=None) -> str:
    urgency = ""
    if priority is not None:
        urgency = "🔴 " if priority <= 1 else "🟠 " if priority <= 2 else "🟡 "
    pomo_str = f" _({pomo_elapsed}/{pomo_est} 🍅)_" if pomo_est else ""
    mins_str = f" _(~{mins}m)_" if mins else ""
    overdue_str = f" _(was due {overdue_date})_" if overdue_date else ""
    return f"  {urgency}{title}{pomo_str}{mins_str}{overdue_str}"


# ─── Main Lambda handler ──────────────────────────────────────────────────────

def lambda_handler(event, context):
    BOT_TOKEN        = os.environ.get("TELEGRAM_BOT_TOKEN")
    CHAT_ID          = os.environ.get("TELEGRAM_CHAT_ID")
    SUPABASE_URL     = os.environ.get("SUPABASE_URL")
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

    if not all([BOT_TOKEN, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY]):
        print("[ERROR] Missing required environment variables.")
        return {"statusCode": 500, "body": "Missing environment variables"}

    now_ist = datetime.now(IST)
    today_str = now_ist.strftime("%Y-%m-%d")
    slot_start, slot_end, is_morning, is_evening = get_current_slot(now_ist)

    print(f"[Cron] {now_ist.strftime('%Y-%m-%d %H:%M IST')} | "
          f"Slot {slot_start.strftime('%H:%M')}–{slot_end.strftime('%H:%M')} | "
          f"Morning={is_morning} Evening={is_evening}")

    messages_sent = 0

    # ── 1. MORNING SLOT (7:00 AM IST) ─────────────────────────────────────────
    # Send today's day-deadline tasks as a morning briefing
    if is_morning:
        tasks = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "tasks", {
            "select": "id,title,status,estimated_pomodoros,elapsed_pomodoros",
            "due_date": f"eq.{today_str}",
            "status": "in.(todo,in-progress)",
            "parent_task_id": "is.null",
            "order": "priority.asc",
        })

        # Day-only pressure tasks due today
        pressure_tasks_today = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "pressure_tasks", {
            "select": "id,title,priority,status,estimated_minutes,deadline",
            "status": "in.(todo,snoozed)",
            "order": "priority.asc",
        })
        # Filter: date-only deadlines that match today
        day_pressure = []
        for t in pressure_tasks_today:
            date_only, dt = parse_deadline(t.get("deadline") or "")
            if date_only and dt and dt.strftime("%Y-%m-%d") == today_str:
                day_pressure.append(t)

        if tasks or day_pressure:
            lines = [f"☀️ *Morning Briefing — {now_ist.strftime('%d %b %Y')}*\n"]
            lines.append("You have deadline tasks due today:\n")

            if tasks:
                lines.append("📌 *Tasks:*")
                for t in tasks:
                    lines.append(format_task_line(
                        t["title"],
                        pomo_elapsed=t.get("elapsed_pomodoros", 0),
                        pomo_est=t.get("estimated_pomodoros"),
                    ))
                lines.append("")

            if day_pressure:
                lines.append("⚡ *Pressure Tasks:*")
                for t in day_pressure:
                    lines.append(format_task_line(
                        t["title"],
                        mins=t.get("estimated_minutes"),
                        priority=t.get("priority", 3),
                    ))
                lines.append("")

            lines.append("_Get after it! Reply /tasks or /pressure to view details._")
            send_telegram(BOT_TOKEN, CHAT_ID, "\n".join(lines))
            messages_sent += 1
            print(f"[Cron] Morning briefing sent ({len(tasks)} tasks, {len(day_pressure)} pressure tasks)")
        else:
            print("[Cron] Morning slot: no day-deadline tasks today — skipping")

    # ── 2. EVENING SLOT (9:00 PM IST) ─────────────────────────────────────────
    # Re-ping tasks that are STILL not done
    elif is_evening:
        tasks = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "tasks", {
            "select": "id,title,status,estimated_pomodoros,elapsed_pomodoros",
            "due_date": f"eq.{today_str}",
            "status": "in.(todo,in-progress)",
            "parent_task_id": "is.null",
            "order": "priority.asc",
        })

        pressure_tasks_today = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "pressure_tasks", {
            "select": "id,title,priority,status,estimated_minutes,deadline",
            "status": "in.(todo,snoozed)",
            "order": "priority.asc",
        })
        day_pressure = []
        for t in pressure_tasks_today:
            date_only, dt = parse_deadline(t.get("deadline") or "")
            if date_only and dt and dt.strftime("%Y-%m-%d") == today_str:
                day_pressure.append(t)

        # Also fetch overdue pressure tasks (deadline < today, still open)
        overdue = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "pressure_tasks", {
            "select": "id,title,priority,deadline",
            "deadline": f"lt.{today_str}",
            "status": "in.(todo,snoozed)",
            "order": "deadline.asc",
            "limit": "5",
        })

        if tasks or day_pressure or overdue:
            lines = [f"🌙 *Evening Check-in — {now_ist.strftime('%d %b %Y')}*\n"]

            if tasks or day_pressure:
                lines.append("⚠️ These are *still not done* today:\n")

            if tasks:
                lines.append("📌 *Tasks:*")
                for t in tasks:
                    lines.append(format_task_line(
                        t["title"],
                        pomo_elapsed=t.get("elapsed_pomodoros", 0),
                        pomo_est=t.get("estimated_pomodoros"),
                    ))
                lines.append("")

            if day_pressure:
                lines.append("⚡ *Pressure Tasks:*")
                for t in day_pressure:
                    lines.append(format_task_line(
                        t["title"],
                        mins=t.get("estimated_minutes"),
                        priority=t.get("priority", 3),
                    ))
                lines.append("")

            if overdue:
                lines.append("🔴 *Overdue (from previous days):*")
                for t in overdue:
                    date_only, dt = parse_deadline(t.get("deadline") or "")
                    overdue_date = dt.strftime("%d %b") if dt else t.get("deadline", "?")
                    lines.append(format_task_line(
                        t["title"],
                        priority=t.get("priority", 3),
                        overdue_date=overdue_date,
                    ))
                lines.append("")

            lines.append("_End the day strong or plan tomorrow. Use /journal to reflect._")
            send_telegram(BOT_TOKEN, CHAT_ID, "\n".join(lines))
            messages_sent += 1
            print(f"[Cron] Evening check-in sent ({len(tasks)} tasks, {len(day_pressure)} pressure, {len(overdue)} overdue)")
        else:
            # 🎉 Everything done — send a celebration message!
            send_telegram(BOT_TOKEN, CHAT_ID,
                f"🎉 *Evening Check-in — {now_ist.strftime('%d %b %Y')}*\n\n"
                "All your deadline tasks for today are ✅ done! "
                "Excellent execution. Take the rest of the evening to recover. 🧘"
            )
            messages_sent += 1
            print("[Cron] Evening: all tasks done! Sent celebration message.")

    # ── 3. TIME-SPECIFIC DEADLINE CHECK (every 30-min slot) ───────────────────
    # Check for pressure tasks whose exact deadline timestamp falls in this window
    # (This runs in EVERY slot, including morning/evening — covers time-specific ones)
    all_pressure = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "pressure_tasks", {
        "select": "id,title,priority,status,estimated_minutes,deadline",
        "status": "in.(todo,snoozed)",
        "order": "deadline.asc",
    })

    time_specific_due = []
    for t in all_pressure:
        raw = t.get("deadline")
        if not raw:
            continue
        date_only, dt = parse_deadline(raw)
        if date_only or dt is None:
            continue  # Skip day-only (handled above)
        if deadline_in_slot(dt, slot_start, slot_end):
            time_specific_due.append((t, dt))

    if time_specific_due:
        lines = [f"⏰ *Deadline Alert — {now_ist.strftime('%H:%M IST')}*\n"]
        lines.append("These pressure tasks are due *right now:*\n")
        for t, dt in time_specific_due:
            urgency = "🔴" if t.get("priority", 3) <= 1 else "🟠" if t.get("priority", 3) <= 2 else "🟡"
            mins = f" _(~{t['estimated_minutes']}m)_" if t.get("estimated_minutes") else ""
            time_str = dt.strftime("%I:%M %p")
            lines.append(f"  {urgency} {t['title']}{mins} ← due at {time_str}")

        lines.append("\n_Mark complete in the app or send a voice note to log it._")
        send_telegram(BOT_TOKEN, CHAT_ID, "\n".join(lines))
        messages_sent += 1
        print(f"[Cron] Time-specific alert sent: {len(time_specific_due)} task(s)")

    # ── 4. DYNAMIC REMINDERS (from telegram_reminders table) ──────────────────
    # The AI agent creates these on request ("remind me at 3pm to take medicine")
    # We check for any reminders whose remind_at falls in the current 30-min slot.
    active_reminders = supabase_get(SUPABASE_URL, SUPABASE_ANON_KEY, "telegram_reminders", {
        "select": "id,label,message,remind_at,is_recurring,recur_every_minutes",
        "is_active": "eq.true",
        "order": "remind_at.asc",
    })

    for reminder in active_reminders:
        raw_at = reminder.get("remind_at")
        if not raw_at:
            continue

        # Parse the remind_at timestamp (stored in UTC by the Vercel route)
        try:
            # Handle ISO format with or without timezone
            raw_at = raw_at.replace("Z", "+00:00")
            remind_utc = datetime.fromisoformat(raw_at)
            if remind_utc.tzinfo is None:
                remind_utc = remind_utc.replace(tzinfo=timezone.utc)
            remind_ist = remind_utc.astimezone(IST)
        except (ValueError, AttributeError) as e:
            print(f"[Cron] Could not parse reminder remind_at: {raw_at!r} — {e}")
            continue

        if not deadline_in_slot(remind_ist, slot_start, slot_end):
            continue

        # Fire the reminder
        label = reminder.get("label", "Reminder")
        message = reminder.get("message", "")
        send_telegram(BOT_TOKEN, CHAT_ID, f"🔔 *{label}*\n\n{message}")
        messages_sent += 1
        print(f"[Cron] Dynamic reminder fired: '{label}'")

        # Update the reminder in Supabase
        reminder_id = reminder["id"]
        is_recurring = reminder.get("is_recurring", False)
        recur_mins = reminder.get("recur_every_minutes")
        now_utc = datetime.now(timezone.utc)

        if is_recurring and recur_mins:
            # Advance remind_at by the recurrence interval
            next_fire_utc = remind_utc + timedelta(minutes=int(recur_mins))
            update_payload = json.dumps({
                "last_sent_at": now_utc.isoformat(),
                "remind_at": next_fire_utc.isoformat(),
            }).encode("utf-8")
        else:
            # One-time reminder — deactivate
            update_payload = json.dumps({
                "last_sent_at": now_utc.isoformat(),
                "is_active": False,
            }).encode("utf-8")

        update_url = f"{SUPABASE_URL}/rest/v1/telegram_reminders?id=eq.{reminder_id}"
        update_req = urllib.request.Request(
            update_url,
            data=update_payload,
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            method="PATCH",
        )
        try:
            with urllib.request.urlopen(update_req, timeout=10):
                pass
        except Exception as e:
            print(f"[Cron] Failed to update reminder {reminder_id}: {e}")

    print(f"[Cron] Done. {messages_sent} message(s) sent.")
    return {
        "statusCode": 200,
        "body": json.dumps({
            "slot": slot_start.strftime("%H:%M IST"),
            "morning": is_morning,
            "evening": is_evening,
            "messages_sent": messages_sent,
            "time_specific_alerts": len(time_specific_due) if 'time_specific_due' in dir() else 0,
        }),
    }

