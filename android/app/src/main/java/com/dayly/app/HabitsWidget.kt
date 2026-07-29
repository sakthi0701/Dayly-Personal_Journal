package com.dayly.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException

class HabitsWidget : AppWidgetProvider() {

    companion object {
        private const val PREFS_FILE = "CapacitorStorage"
        private const val KEY_HABITS = "widget_habits"
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
        if (intent.action == "com.dayly.WIDGET_UPDATE") {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, HabitsWidget::class.java)
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
        val habitsJsonStr = prefs.getString(KEY_HABITS, null)
        
        val views = RemoteViews(context.packageName, R.layout.widget_habits)
        views.removeAllViews(R.id.widget_habits_container)

        if (habitsJsonStr != null) {
            try {
                val jsonArray = JSONArray(habitsJsonStr)
                for (i in 0 until jsonArray.length()) {
                    val habitObj = jsonArray.getJSONObject(i)
                    val title = habitObj.optString("title", "Unknown Habit")
                    
                    val itemView = RemoteViews(context.packageName, R.layout.widget_habit_item)
                    itemView.setTextViewText(R.id.habit_title, title)
                    views.addView(R.id.widget_habits_container, itemView)
                }
            } catch (e: JSONException) {
                e.printStackTrace()
            }
        } else {
            // Mock data
            val mockHabits = listOf("Exercise", "Meditation")
            for (title in mockHabits) {
                val itemView = RemoteViews(context.packageName, R.layout.widget_habit_item)
                itemView.setTextViewText(R.id.habit_title, title)
                views.addView(R.id.widget_habits_container, itemView)
            }
        }

        // ── Action: Open App ──────────────────────────────────────────────────
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingLaunch = PendingIntent.getActivity(
                context, widgetId + 300000, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingLaunch)
        }

        // ── Action: Refresh ───────────────────────────────────────────────────
        val refreshIntent = Intent("com.dayly.WIDGET_UPDATE").apply {
            component = ComponentName(context, HabitsWidget::class.java)
        }
        val pendingRefresh = PendingIntent.getBroadcast(
            context, widgetId + 400000, refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
