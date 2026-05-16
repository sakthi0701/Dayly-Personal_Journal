package com.dayly.app

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
        // ⚠️ Must match Capacitor v4+ preferences file name
        private const val PREFS_FILE = "_capacitor_storage_plugin"
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
        val habitsJsonStr = prefs.getString("cap.$KEY_HABITS", null)
        
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

        // Refresh button intent
        val refreshIntent = Intent(context, HabitsWidget::class.java).apply {
            action = "com.dayly.WIDGET_UPDATE"
        }
        val pendingRefresh = android.app.PendingIntent.getBroadcast(
            context, widgetId + 100000, refreshIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)

        // Open app intent
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingLaunch = android.app.PendingIntent.getActivity(
                context, widgetId, launchIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_habits_title, pendingLaunch)
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
