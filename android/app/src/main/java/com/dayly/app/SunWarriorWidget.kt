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
        // ⚠️ Must match Capacitor v4+ preferences file name
        // If you downgrade to Capacitor v3, change to "CapacitorStorage"
        private const val PREFS_FILE = "_capacitor_storage_plugin"

        // Keys written by lib/cache.ts (CACHE_KEYS.USER_STATS stored as JSON)
        // The widget reads the raw nested values for performance
        private const val KEY_STREAK = "streak_days"
        private const val KEY_XP     = "xp"

        // Must mirror lib/gamification.ts XP_PER_LEVEL constant
        private const val XP_PER_LEVEL = 100
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
        // Handle immediate refresh triggered from JS bridge
        if (intent.action == "com.dayly.WIDGET_UPDATE") {
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

        // Capacitor stores values with a "cap." namespace prefix
        val streak = prefs.getString("cap.$KEY_STREAK", "0")?.toIntOrNull() ?: 0
        val xp     = prefs.getString("cap.$KEY_XP", "0")?.toIntOrNull() ?: 0

        val avatarState = when {
            streak >= 7  -> "sun"       // 🔥 Full Sun Warrior
            streak >= 3  -> "warm"      // ⚡ Building momentum
            streak >= 1  -> "starting"  // 🌤 Just started
            else         -> "dormant"   // 🧊 Dormant
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
            "sun"      -> Pair("Sun Warrior 🔥", 0xFFFFD700.toInt())  // Gold
            "warm"     -> Pair("On Fire ⚡",      0xFFFFD700.toInt())
            "starting" -> Pair("Building...",      0xFF87CEEB.toInt()) // Ice blue
            else       -> Pair("Start Today",      0xFF87CEEB.toInt())
        }
        views.setTextViewText(R.id.widget_state_label, label)
        views.setTextColor(R.id.widget_state_label, labelColor)

        // Refresh button intent
        val refreshIntent = Intent(context, SunWarriorWidget::class.java).apply {
            action = "com.dayly.WIDGET_UPDATE"
        }
        val pendingRefresh = android.app.PendingIntent.getBroadcast(
            context, widgetId, refreshIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)

        // Open app intent
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingLaunch = android.app.PendingIntent.getActivity(
                context, widgetId, launchIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_streak_number, pendingLaunch)
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
