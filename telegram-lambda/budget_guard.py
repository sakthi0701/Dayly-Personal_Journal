"""
budget_guard.py — AWS Lambda Function
=======================================
Triggered by an AWS Budget Alert SNS notification when cost > $0.
Disables the deadline_cron EventBridge rule and notifies you on Telegram.

This is your "nuclear switch" — if AWS ever starts charging you,
this Lambda fires and disables the cron automatically.

Attach this Lambda as the target of an SNS topic that your Budget Alert sends to.

Environment Variables:
    TELEGRAM_BOT_TOKEN       Your bot token
    TELEGRAM_CHAT_ID         Your numeric chat ID
    CRON_RULE_NAME           Name of your EventBridge rule (e.g., dayly-deadline-cron)
    AWS_REGION_NAME          Your Lambda region (e.g., ap-south-1)

IAM Permissions needed for this Lambda's execution role:
    - events:DisableRule
    - events:DescribeRule
"""

import json
import os
import urllib.request
import urllib.parse
import boto3


def send_telegram(token: str, chat_id: str, text: str) -> None:
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
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[Telegram] Alert send failed: {e}")


def lambda_handler(event, context):
    BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
    CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
    RULE_NAME = os.environ.get("CRON_RULE_NAME", "dayly-deadline-cron")
    REGION = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))

    print(f"[BudgetGuard] Triggered! Disabling EventBridge rule: {RULE_NAME}")

    try:
        eb = boto3.client("events", region_name=REGION)
        eb.disable_rule(Name=RULE_NAME)
        print(f"[BudgetGuard] Rule '{RULE_NAME}' disabled successfully.")
        alert_msg = (
            "🚨 *AWS Cost Alert — Dayly Bot*\n\n"
            "AWS detected a charge exceeding $0.\n"
            f"✅ EventBridge rule `{RULE_NAME}` has been *automatically disabled* to stop costs.\n\n"
            "Check your AWS console: Billing → Cost Explorer to investigate.\n"
            "Re-enable the rule manually once resolved."
        )
    except Exception as e:
        print(f"[BudgetGuard] Failed to disable rule: {e}")
        alert_msg = (
            "🚨 *AWS Cost Alert — Dayly Bot*\n\n"
            f"AWS detected a charge exceeding $0, but I *failed to auto-disable* the cron rule.\n"
            f"Error: `{str(e)}`\n\n"
            "Please go to AWS Console → EventBridge → Rules and disable it manually!"
        )

    if BOT_TOKEN and CHAT_ID:
        send_telegram(BOT_TOKEN, CHAT_ID, alert_msg)

    return {"statusCode": 200, "body": "Budget guard executed"}
