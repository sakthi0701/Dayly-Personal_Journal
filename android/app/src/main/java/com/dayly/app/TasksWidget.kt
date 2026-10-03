package com.dayly.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews

class TasksWidget : AppWidgetProvider() {

    companion object {
        private const val PREFS_FILE = "CapacitorStorage"
        const val ACTION_UPDATE = "com.dayly.WIDGET_UPDATE"
        const val ACTION_COMPLETE_TASK = "com.dayly.ACTION_COMPLETE_TASK"
        const val ACTION_REFRESH_MANUAL = "com.dayly.ACTION_REFRESH_MANUAL"
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
        val action = intent.action ?: return

        if (action == ACTION_COMPLETE_TASK) {
            val taskId = intent.getStringExtra("task_id") ?: ""
            val taskTitle = intent.getStringExtra("task_title") ?: "Task"
            val isPressure = intent.getBooleanExtra("is_pressure", false)
            if (taskId.isNotEmpty()) {
                WidgetSyncHelper.completeTask(context, taskId, taskTitle, isPressure)
            }
        } else if (action == ACTION_REFRESH_MANUAL) {
            WidgetSyncHelper.refreshDataFromServer(context)
        } else if (action == ACTION_UPDATE || action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, TasksWidget::class.java)
            )
            manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_tasks_list)
            for (id in ids) {
                updateWidget(context, manager, id)
            }
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        widgetId: Int
    ) {
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        
        val timerStatus = prefs.getString("widget_timer_status", "idle")
        val timerTitle = prefs.getString("widget_timer_title", "")
        val timerRemaining = prefs.getString("widget_timer_remaining", "")

        val views = RemoteViews(context.packageName, R.layout.widget_tasks)

        // ── Active Timer Header ──────────────────────────────────────────
        if (timerStatus == "running" || timerStatus == "paused") {
            val statusIcon = if (timerStatus == "paused") "⏸️" else "⏳"
            views.setViewVisibility(R.id.widget_tasks_container, View.VISIBLE)
            views.setTextViewText(R.id.widget_timer_text, "$statusIcon $timerTitle ($timerRemaining)")
        } else {
            views.setViewVisibility(R.id.widget_tasks_container, View.GONE)
        }

        // ── List View Setup ──────────────────────────────────────────────
        val serviceIntent = Intent(context, TasksWidgetService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
        }
        views.setRemoteAdapter(R.id.widget_tasks_list, serviceIntent)
        views.setEmptyView(R.id.widget_tasks_list, R.id.widget_empty_view)

        // ── Action: Task Item Completion Template ─────────────────────────
        val itemClickIntent = Intent(context, TasksWidget::class.java).apply {
            action = ACTION_COMPLETE_TASK
        }
        val pendingItemClick = PendingIntent.getBroadcast(
            context, widgetId, itemClickIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        views.setPendingIntentTemplate(R.id.widget_tasks_list, pendingItemClick)

        // ── Action: Open App on Title Click ───────────────────────────────
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingLaunch = PendingIntent.getActivity(
                context, widgetId + 100000, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_tasks_title, pendingLaunch)
        }

        // ── Action: Refresh ───────────────────────────────────────────────
        val refreshIntent = Intent(context, TasksWidget::class.java).apply {
            action = ACTION_REFRESH_MANUAL
        }
        val pendingRefresh = PendingIntent.getBroadcast(
            context, widgetId + 200000, refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, pendingRefresh)

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
