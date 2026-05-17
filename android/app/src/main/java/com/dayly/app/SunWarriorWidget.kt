package com.dayly.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * SunWarriorWidget
 *
 * Reads streak and XP from the same SharedPreferences file that
 * Capacitor's @capacitor/preferences plugin writes to.
 *
 * Data is synced from the JS side via lib/cache.ts → Capacitor Preferences
 * after every gamification update (dashboard load, entry submission).
 */
class SunWarriorWidget : AppWidgetProvider() {

    companion object {
        // ⚠️ Must match Capacitor Preferences plugin SharedPreferences file
        private const val PREFS_FILE = "CapacitorStorage"
        private const val KEY_STREAK = "streak_days"
        private const val KEY_XP     = "xp"
        private const val XP_PER_LEVEL = 100
        const val ACTION_REFRESH = "com.dayly.WIDGET_UPDATE"
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, SunWarriorWidget::class.java)
            )
            onUpdate(context, manager, ids)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        widgetId: Int
    ) {
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

        // Capacitor Preferences stores values with plain keys (no prefix)
        val streak = prefs.getString(KEY_STREAK, "0")?.toIntOrNull() ?: 0
        val xp     = prefs.getString(KEY_XP, "0")?.toIntOrNull() ?: 0

        val avatarState = when {
            streak >= 7  -> "sun"
            streak >= 3  -> "warm"
            streak >= 1  -> "starting"
            else         -> "dormant"
        }

        val xpProgress = ((xp % XP_PER_LEVEL) * 100) / XP_PER_LEVEL.coerceAtLeast(1)

        val views = RemoteViews(context.packageName, R.layout.sun_warrior_widget)

        views.setTextViewText(R.id.widget_streak_number, streak.toString())
        views.setTextViewText(R.id.widget_xp_text, "XP $xp")
        views.setProgressBar(R.id.widget_xp_progress, 100, xpProgress, false)

        val iconRes = when (avatarState) {
            "sun"      -> R.drawable.ic_sun_warrior_sun
            "warm"     -> R.drawable.ic_sun_warrior_warm
            "starting" -> R.drawable.ic_sun_warrior_starting
            else       -> R.drawable.ic_sun_warrior_dormant
        }
        views.setImageViewResource(R.id.widget_avatar_icon, iconRes)

        val (label, labelColor) = when (avatarState) {
            "sun"      -> Pair("Sun Warrior 🔥", 0xFFFFD700.toInt())
            "warm"     -> Pair("On Fire ⚡",      0xFFFFD700.toInt())
            "starting" -> Pair("Building...",      0xFF87CEEB.toInt())
            else       -> Pair("Start Today",      0xFF87CEEB.toInt())
        }
        views.setTextViewText(R.id.widget_state_label, label)
        views.setTextColor(R.id.widget_state_label, labelColor)

        // ── Refresh button: explicit broadcast so Android 12+ delivers it ──────
        val refreshIntent = Intent(ACTION_REFRESH).apply {
            component = ComponentName(context, SunWarriorWidget::class.java)
        }
        val pendingRefresh = android.app.PendingIntent.getBroadcast(
            context,
            widgetId + 600000, // Unique offset for SunWarriorWidget refresh
            refreshIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)
        views.setOnClickPendingIntent(R.id.widget_root, pendingRefresh)

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
