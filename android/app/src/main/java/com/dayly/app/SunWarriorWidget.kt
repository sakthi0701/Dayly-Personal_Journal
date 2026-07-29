package com.dayly.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class SunWarriorWidget : AppWidgetProvider() {

    companion object {
        private const val PREFS_FILE = "CapacitorStorage"
        private const val KEY_STREAK = "streak_days"
        private const val KEY_XP     = "xp"
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

        val streak = prefs.getString(KEY_STREAK, "0")?.toIntOrNull() ?: 0
        val xp     = prefs.getString(KEY_XP, "0")?.toIntOrNull() ?: 0
        val avatarState = prefs.getString("avatar_state", "dormant")
        val levelTitle = prefs.getString("level_title", "Novice")
        val levelProgress = prefs.getString("level_progress", "0")?.toIntOrNull() ?: 0

        val views = RemoteViews(context.packageName, R.layout.sun_warrior_widget)

        views.setTextViewText(R.id.widget_streak_number, streak.toString())
        views.setTextViewText(R.id.widget_xp_text, "XP $xp")
        views.setProgressBar(R.id.widget_xp_progress, 100, levelProgress, false)

        val iconRes = when (avatarState) {
            "sun"      -> R.drawable.ic_sun_warrior_sun
            "warm", "active" -> R.drawable.ic_sun_warrior_warm
            "ice", "cold"    -> R.drawable.ic_sun_warrior_dormant
            else       -> R.drawable.ic_sun_warrior_dormant
        }
        views.setImageViewResource(R.id.widget_avatar_icon, iconRes)

        val labelColor = when (avatarState) {
            "sun", "warm", "active" -> 0xFFFFD700.toInt()
            else -> 0xFF87CEEB.toInt()
        }
        views.setTextViewText(R.id.widget_state_label, levelTitle)
        views.setTextColor(R.id.widget_state_label, labelColor)

        // ── Action: Open App ──────────────────────────────────────────────────
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingLaunch = PendingIntent.getActivity(
                context, widgetId + 500000, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingLaunch)
        }

        // ── Action: Refresh ───────────────────────────────────────────────────
        val refreshIntent = Intent(ACTION_REFRESH).apply {
            component = ComponentName(context, SunWarriorWidget::class.java)
        }
        val pendingRefresh = PendingIntent.getBroadcast(
            context,
            widgetId + 600000,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
