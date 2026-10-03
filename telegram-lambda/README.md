# Dayly Telegram Bot — AWS Lambda Deployment Guide

> **Free forever.** Lambda free tier = 1 million requests/month + 400,000 GB-seconds compute.
> Our cron runs once per day = ~30 invocations/month. We use **0.003%** of the free tier.

---

## Architecture Overview

```
[Telegram user]
      │
      │ sends message
      ▼
[Telegram Servers]
      │
      │ webhook POST (free, Telegram pushes to you)
      ▼
[Vercel — /api/telegram]   ← handles ALL commands, AI, Supabase
      │
      │ replies via Telegram Bot API
      ▼
[Telegram user gets reply]

─────────────────────────────────────────────────────

[AWS EventBridge Cron]
      │ fires once/day at your chosen time
      ▼
[Lambda: deadline_cron.py]
      │ queries Supabase REST API
      │ sends Telegram message directly
      ▼
[Telegram user gets deadline reminder]
```

**Key insight:** Vercel (already deployed) handles all the complex logic.
Lambda only runs the daily deadline cron. This costs **nothing**.

---

## ⚠️ Bug in Google's Code (Fixed Here)

Google's sample had a critical typo in the Telegram API URL:

```python
# ❌ WRONG (Google's code) — wrong domain, missing /bot prefix
url = f"https://telegram.org{BOT_TOKEN}/sendMessage"

# ✅ CORRECT (used in all our functions)
url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
```

All functions in this directory use the correct URL.

---

## Part 1 — Register the Telegram Webhook (One-Time, Local)

This replaces the local polling bot. Run once after Vercel is deployed.

```bash
# From the telegram-lambda/ directory
python register_webhook.py
```

Expected output:
```
Clearing existing webhook...
  deleteWebhook: ✅
Registering webhook → https://dayly7.vercel.app/api/telegram
  ✅ Webhook registered successfully!
Verifying webhook info...
  URL:            https://dayly7.vercel.app/api/telegram
  Pending:        0
  Last error:     none

🚀 Done! Telegram will now push updates to your Vercel app.
```

**After this step, the `telegram-bot/` local Node.js script is no longer needed.**

---

## Part 2 — Deploy the Smart Deadline Cron Lambda

### Reminder Logic

A **single Lambda runs every 30 minutes**. Inside it, three things happen:

| Slot | Triggers when (IST) | What fires |
|------|---------------------|------------|
| ☀️ Morning | 7:00–7:29 AM IST | Lists ALL day-deadline tasks due today |
| 🌙 Evening | 9:00–9:29 PM IST | Re-pings tasks STILL not done + overdue + 🎉 if all done |
| ⏰ Time-specific | Every 30-min slot | Pressure tasks with exact timestamp deadline in this window |

**Date-only vs DateTime detection (automatic):**
- `pressure_tasks.deadline = "2026-10-05"` → day-only → 7AM + 9PM
- `pressure_tasks.deadline = "2026-10-05T14:30:00"` → exact time → fires at 2:00–2:29 PM slot
- `tasks.due_date = "2026-10-05"` → always date-only → 7AM + 9PM

### Step 1: Create the Lambda Function

1. Open the AWS Lambda Console
2. Click **Create function**
3. Choose **Author from scratch**
4. Set:
   - **Function name:** `dayly-deadline-cron`
   - **Runtime:** `Python 3.12`
   - **Architecture:** `x86_64`
5. Click **Create function**

### Step 2: Upload the Code

1. In the Lambda editor, replace all code in `lambda_function.py` with the contents of **`smart_deadline_cron.py`**
2. Make sure the handler is set to `lambda_function.lambda_handler` in Runtime settings
3. Click **Deploy**

### Step 3: Add Environment Variables

In your Lambda function → **Configuration** tab → **Environment variables** → **Edit**:

| Key | Value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | `8633755254:AAHzThpxp04eESMME_Nv0uksULh9Qs6apBQ` |
| `TELEGRAM_CHAT_ID` | `7946225655` |
| `SUPABASE_URL` | `https://mquhecydbvvkbnlnqjpo.supabase.co` |
| `SUPABASE_ANON_KEY` | *(your anon key from Supabase dashboard)* |

Click **Save**.

### Step 4: Set Timeout

Go to **Configuration** → **General configuration** → **Edit**:
- Set **Timeout** to `30 seconds`
- Memory: `128 MB` (default)

### Step 5: Test It

1. Click the **Test** tab
2. Create a test event with `{}` as the body
3. Click **Test** — check the execution logs for what slot logic ran

---

## Part 3 — Set Up the Cron Trigger (EventBridge)

### The Cron Expression

The Lambda must run **every 30 minutes** so it can catch time-specific deadlines within a 30-minute window.

**AWS EventBridge cron:** `0/30 * * * ? *`

> **Free tier math:** 48 runs/day × 30 days = **1,440 invocations/month** vs. the **1,000,000/month** free tier = 0.14% used.

### Steps

1. Open Amazon EventBridge Console
2. Left sidebar → **Buses** → **Rules**
3. Click **Create rule**
4. Configure:
   - **Name:** `dayly-deadline-cron`
   - **Rule type:** `Schedule`
   - Click **Next**
5. Schedule pattern:
   - Select **A fine-grained schedule (cron expression)**
   - Enter: `0/30 * * * ? *`
   *(Note: AWS cron REQUIRES `?` for either day-of-month OR day-of-week field)*
6. Click **Next**
7. Target:
   - **Target types:** AWS service
   - **Select a target:** Lambda function
   - **Function:** `dayly-deadline-cron`
8. Click **Next** → skip tags → **Create rule**

### How the reminders fire

```
Lambda runs at:     ...7:00AM  7:30AM  ...  9:00PM  9:30PM  ...
                          │                     │
                          ╰── Morning briefing    ╰── Evening follow-up
                              (day deadlines)          (still-incomplete tasks)

Time-specific:
  deadline = "2026-10-05T14:30:00" → fires at the 14:00 or 14:30 slot (whichever contains 14:30)
  deadline = "2026-10-05T09:00:00" → fires at the 9:00 AM slot
```

---

## Part 4 — Stop Log Accumulation (CRUCIAL for free tier)

Without this, CloudWatch logs accumulate indefinitely and will eventually exceed the 5 GB free tier.

1. Open CloudWatch Console
2. Left sidebar → **Logs** → **Log groups**
3. Find `/aws/lambda/dayly-deadline-cron`
4. Click on it → **Actions** → **Edit retention setting**
5. Change from **Never expire** → **1 day**
6. Click **Save**

Repeat for any other Lambda log groups you create.

---

## Part 5 — Cost Protection (Auto-Disable if Any Charge Occurs)

This sets up an automatic kill-switch: if AWS charges you even $0.01, the cron is auto-disabled and you get a Telegram alert.

### Step 1: Create the Budget Guard Lambda

1. Create another Lambda function named `dayly-budget-guard`
2. Runtime: `Python 3.12`
3. Paste the contents of `budget_guard.py`
4. Add environment variables:
   - `TELEGRAM_BOT_TOKEN` — same as above
   - `TELEGRAM_CHAT_ID` — same as above
   - `CRON_RULE_NAME` — `dayly-deadline-cron`
5. **IAM Role** — the Lambda needs permission to disable EventBridge rules:
   - Go to **Configuration** → **Permissions** → click the execution role link
   - In IAM, click **Add permissions** → **Create inline policy**
   - Paste this JSON:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["events:DisableRule", "events:DescribeRule"],
           "Resource": "arn:aws:events:*:*:rule/dayly-deadline-cron"
         }
       ]
     }
     ```
   - Name it `DisableCronRule` → **Create policy**

### Step 2: Create an SNS Topic for Budget Alerts

1. Open SNS Console
2. Click **Topics** → **Create topic**
3. Type: **Standard**, Name: `dayly-budget-alert`
4. Click **Create subscription**:
   - Protocol: **Lambda**
   - Endpoint: select `dayly-budget-guard`
5. Click **Create subscription**

### Step 3: Connect Budget Alert to SNS

1. Open AWS Budgets
2. Edit your existing Zero Spend Budget (or create one)
3. In **Alerts** → threshold at **$0.01** (actual cost)
4. Under **Notifications** → **Add SNS alert** → select `dayly-budget-alert`
5. Save

**Kill-switch chain:**
```
AWS charges $0.01 → Budget fires → SNS → budget_guard Lambda → disables EventBridge rule → Telegram alert
```

---

## Summary

| Component | Where | Cost |
|-----------|-------|------|
| Bot command handler (journal, habits, tasks, AI) | Vercel (existing) | $0 |
| Telegram webhook registration | Local script (one-time) | $0 |
| Daily deadline reminder cron | AWS Lambda + EventBridge | $0 |
| Cost kill-switch | AWS Lambda + SNS + Budget | $0 |
| **Total monthly AWS cost** | | **$0.00** |

Lambda free tier covers 1,000,000 invocations/month.
Our cron runs ~30 times/month = **0.003%** of the free tier.

---

## Troubleshooting

**Bot not responding to messages?**
- Run `register_webhook.py` again to re-register the webhook
- Check Vercel logs → your project → Functions tab

**Cron not firing?**
- Check EventBridge rule is **Enabled** (not Disabled)
- Check CloudWatch logs: `/aws/lambda/dayly-deadline-cron`

**"Missing environment variables" error in Lambda?**
- Double-check all 4 env vars are set in Lambda → Configuration → Environment variables
- Click **Deploy** after making any code changes

**Supabase returning empty results?**
- Verify the `due_date` column exists on your `tasks` table
- Ensure RLS (Row Level Security) allows reads with the anon key, or disable RLS for single-user MVP
