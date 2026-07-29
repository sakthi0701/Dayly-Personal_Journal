package com.dayly.app

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONException

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TasksRemoteViewsFactory(this.applicationContext)
    }
}

class TasksRemoteViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var tasks: List<TaskItem> = listOf()

    companion object {
        private const val PREFS_FILE = "CapacitorStorage"
        private const val KEY_TASKS = "widget_tasks"
    }

    data class TaskItem(val title: String, val progress: Int, val isPressure: Boolean)

    override fun onCreate() {}

    override fun onDataSetChanged() {
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        val tasksJsonStr = prefs.getString(KEY_TASKS, null)
        
        val newList = mutableListOf<TaskItem>()
        if (tasksJsonStr != null) {
            try {
                val jsonArray = JSONArray(tasksJsonStr)
                for (i in 0 until jsonArray.length()) {
                    val taskObj = jsonArray.getJSONObject(i)
                    newList.add(TaskItem(
                        taskObj.optString("title", "Unknown Task"),
                        taskObj.optInt("progress", 0),
                        taskObj.optBoolean("isPressure", false)
                    ))
                }
            } catch (e: JSONException) {
                e.printStackTrace()
            }
        } else {
            // Mock data so the widget isn't empty on first install
            newList.add(TaskItem("Welcome to Dayly", 0, false))
            newList.add(TaskItem("Sync from app", 0, false))
        }
        tasks = newList
    }

    override fun onDestroy() {}

    override fun getCount(): Int = tasks.size

    override fun getViewAt(position: Int): RemoteViews {
        if (position >= tasks.size) return RemoteViews(context.packageName, R.layout.widget_task_item)

        val task = tasks[position]
        val rv = RemoteViews(context.packageName, R.layout.widget_task_item)
        
        val displayTitle = if (task.isPressure) "🔥 ${task.title}" else task.title
        rv.setTextViewText(R.id.task_title, displayTitle)
        
        if (task.isPressure) {
            rv.setProgressBar(R.id.task_progress, 100, 100, false)
        } else {
            rv.setProgressBar(R.id.task_progress, 100, task.progress, false)
        }

        // Fill-in Intent for item click (handled by PendingIntentTemplate in Provider)
        val fillInIntent = Intent()
        rv.setOnClickFillInIntent(R.id.task_title, fillInIntent)
        rv.setOnClickFillInIntent(R.id.task_progress, fillInIntent)

        return rv
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true
}
