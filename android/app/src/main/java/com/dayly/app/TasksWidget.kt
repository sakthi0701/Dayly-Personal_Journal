package com.dayly.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException

class TasksWidget : AppWidgetProvider() {

    companion object {
        private const val PREFS_FILE = "DaylyCache"
        private const val KEY_TASKS = "widget_tasks"
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
                ComponentName(context, TasksWidget::class.java)
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
        val tasksJsonStr = prefs.getString("cap.$KEY_TASKS", null)
        
        val views = RemoteViews(context.packageName, R.layout.widget_tasks)
        views.removeAllViews(R.id.widget_tasks_container)

        if (tasksJsonStr != null) {
            try {
                val jsonArray = JSONArray(tasksJsonStr)
                for (i in 0 until jsonArray.length()) {
                    val taskObj = jsonArray.getJSONObject(i)
                    val title = taskObj.optString("title", "Unknown Task")
                    val progress = taskObj.optInt("progress", 0)
                    
                    val itemView = RemoteViews(context.packageName, R.layout.widget_task_item)
                    itemView.setTextViewText(R.id.task_title, title)
                    itemView.setProgressBar(R.id.task_progress, 100, progress, false)
                    
                    views.addView(R.id.widget_tasks_container, itemView)
                }
            } catch (e: JSONException) {
                e.printStackTrace()
            }
        } else {
            // Mock data if not synced yet
            val mockTasks = listOf("FCC Stack", "Solar Irradiance", "Exploration Lab", "Threads - Agentic Skills Upgrade", "Medical LLM")
            for (title in mockTasks) {
                val itemView = RemoteViews(context.packageName, R.layout.widget_task_item)
                itemView.setTextViewText(R.id.task_title, title)
                itemView.setProgressBar(R.id.task_progress, 100, 0, false)
                views.addView(R.id.widget_tasks_container, itemView)
            }
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
