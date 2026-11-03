-- ============================================================
-- Dayly — Coins economy (spendable balance + ledger + reward shop)
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- Two balances on user_stats:
--   xp    — lifetime, drives level. Only earnings touch it; never spent or penalised.
--   coins — spendable. Earned alongside xp, lost to habit penalties, spent in the shop.
--           Can go negative (debt), which locks the shop until earned back.
-- Every coin/xp change goes through apply_coin_tx() so the ledger and balances
-- can never drift apart.
-- ============================================================

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS coins          integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS shields        integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS shield_month   text;                       -- 'YYYY-MM' of last purchase
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS shield_bought  integer NOT NULL DEFAULT 0;  -- purchases in shield_month

-- One-time opening balance: existing XP becomes spendable Coins.
-- Guarded by the ledger so re-running this file does not grant it twice.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coin_transactions') THEN
    UPDATE user_stats SET coins = xp;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coin_transactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     integer     NOT NULL,            -- coin delta
  xp_delta   integer     NOT NULL DEFAULT 0,  -- lifetime xp delta (earnings only)
  source     text        NOT NULL,            -- 'earn' | 'habit_week' | 'shop' | 'shield' | ...
  ref_id     text,                            -- idempotency key within a source (NULL = not deduped)
  reason     text        NOT NULL,
  meta       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_time ON coin_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS shop_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  price      integer     NOT NULL CHECK (price > 0),
  archived   boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── apply_coin_tx ────────────────────────────────────────────────────────────
-- Atomically records a ledger row and updates balances.
--   p_require_funds — reject if coins would end below 0 (shop purchases; also blocks while in debt)
--   p_shieldable    — if the user owns a Habit Shield, consume one and zero the amount
-- Returns {ok, duplicate?, insufficient?, shielded?, coins}
CREATE OR REPLACE FUNCTION apply_coin_tx(
  p_amount        integer,
  p_xp_delta      integer,
  p_source        text,
  p_reason        text,
  p_ref_id        text    DEFAULT NULL,
  p_meta          jsonb   DEFAULT '{}'::jsonb,
  p_require_funds boolean DEFAULT false,
  p_shieldable    boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  s         user_stats%ROWTYPE;
  amt       integer := p_amount;
  shielded  boolean := false;
  inserted  uuid;
BEGIN
  SELECT * INTO s FROM user_stats LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_stats');
  END IF;

  IF p_require_funds AND s.coins + amt < 0 THEN
    RETURN jsonb_build_object('ok', false, 'insufficient', true, 'coins', s.coins);
  END IF;

  IF p_shieldable AND amt < 0 AND s.shields > 0 THEN
    shielded := true;
    amt := 0;
  END IF;

  INSERT INTO coin_transactions (amount, xp_delta, source, ref_id, reason, meta)
  VALUES (amt, p_xp_delta, p_source, p_ref_id, p_reason,
          CASE WHEN shielded THEN p_meta || jsonb_build_object('shielded', true, 'blocked', p_amount) ELSE p_meta END)
  ON CONFLICT (source, ref_id) DO NOTHING
  RETURNING id INTO inserted;

  IF inserted IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'duplicate', true, 'coins', s.coins);
  END IF;

  UPDATE user_stats
     SET coins      = coins + amt,
         xp         = xp + p_xp_delta,
         shields    = shields - (CASE WHEN shielded THEN 1 ELSE 0 END),
         updated_at = now()
   WHERE id = s.id;

  RETURN jsonb_build_object('ok', true, 'shielded', shielded, 'coins', s.coins + amt);
END $$;

-- ── buy_shield ───────────────────────────────────────────────────────────────
-- Price doubles with each purchase in a calendar month (IST), resets on the 1st.
CREATE OR REPLACE FUNCTION buy_shield(p_base_price integer, p_month text)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  s      user_stats%ROWTYPE;
  bought integer;
  price  integer;
BEGIN
  SELECT * INTO s FROM user_stats LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_stats');
  END IF;

  bought := CASE WHEN s.shield_month = p_month THEN s.shield_bought ELSE 0 END;
  price  := p_base_price * power(2, bought)::integer;

  IF s.coins < price THEN
    RETURN jsonb_build_object('ok', false, 'insufficient', true, 'coins', s.coins, 'price', price);
  END IF;

  INSERT INTO coin_transactions (amount, source, reason, meta)
  VALUES (-price, 'shield', 'Bought Habit Shield', jsonb_build_object('price', price));

  UPDATE user_stats
     SET coins         = coins - price,
         shields       = shields + 1,
         shield_month  = p_month,
         shield_bought = bought + 1,
         updated_at    = now()
   WHERE id = s.id;

  RETURN jsonb_build_object('ok', true, 'coins', s.coins - price, 'price', price);
END $$;
