package com.dayly.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException

class GoalsWidget : AppWidgetProvider() {

    companion object {
        private const val PREFS_FILE = "DaylyCache"
        private const val KEY_GOALS = "widget_goals"
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
                ComponentName(context, GoalsWidget::class.java)
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
        val goalsJsonStr = prefs.getString("cap.$KEY_GOALS", null)
        
        val views = RemoteViews(context.packageName, R.layout.widget_goals)
        views.removeAllViews(R.id.widget_goals_container)

        if (goalsJsonStr != null) {
            try {
                val jsonArray = JSONArray(goalsJsonStr)
                for (i in 0 until jsonArray.length()) {
                    val goalObj = jsonArray.getJSONObject(i)
                    val title = goalObj.optString("title", "Unknown Goal")
                    val progress = goalObj.optInt("progress", 0)
                    val icon = goalObj.optString("icon", "💻")
                    
                    val itemView = RemoteViews(context.packageName, R.layout.widget_goal_item)
                    itemView.setTextViewText(R.id.goal_title, title)
                    itemView.setTextViewText(R.id.goal_icon, icon)
                    itemView.setTextViewText(R.id.goal_progress_text, "$progress%")
                    itemView.setProgressBar(R.id.goal_progress_bar, 100, progress, false)
                    views.addView(R.id.widget_goals_container, itemView)
                }
            } catch (e: JSONException) {
                e.printStackTrace()
            }
        } else {
            // Mock data
            val mockGoals = listOf(
                Pair("FCC Stack", "💻"),
                Pair("Medical LLM", "🧬")
            )
            for (goal in mockGoals) {
                val itemView = RemoteViews(context.packageName, R.layout.widget_goal_item)
                itemView.setTextViewText(R.id.goal_title, goal.first)
                itemView.setTextViewText(R.id.goal_icon, goal.second)
                itemView.setTextViewText(R.id.goal_progress_text, "50%")
                itemView.setProgressBar(R.id.goal_progress_bar, 100, 50, false)
                views.addView(R.id.widget_goals_container, itemView)
            }
        }

        // Refresh button intent
        val refreshIntent = Intent(context, GoalsWidget::class.java).apply {
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
            views.setOnClickPendingIntent(R.id.widget_goals_title, pendingLaunch)
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
