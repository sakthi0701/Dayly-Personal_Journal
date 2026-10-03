package com.dayly.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object WidgetSyncHelper {

    private const val PREFS_FILE = "CapacitorStorage"
    private const val BASE_URL = "https://dayly7.vercel.app"

    fun completeTask(context: Context, taskId: String, taskTitle: String, isPressure: Boolean) {
        if (taskId.isEmpty()) return

        // 1. Optimistic removal from CapacitorStorage
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        val jsonStr = prefs.getString("widget_tasks", null)
        if (jsonStr != null) {
            try {
                val array = JSONArray(jsonStr)
                val newArray = JSONArray()
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    if (obj.optString("id") != taskId) {
                        newArray.put(obj)
                    }
                }
                prefs.edit().putString("widget_tasks", newArray.toString()).apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // 2. Refresh Task Widget UI immediately
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, TasksWidget::class.java))
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_tasks_list)
        for (id in ids) {
            TasksWidget().onUpdate(context, manager, intArrayOf(id))
        }

        // 3. Show instant Toast feedback
        Toast.makeText(context, "Completed: $taskTitle", Toast.LENGTH_SHORT).show()

        // 4. Background network request to server
        Thread {
            try {
                val endpoint = if (isPressure) {
                    "$BASE_URL/api/pressure-tasks/$taskId"
                } else {
                    "$BASE_URL/api/tasks/$taskId"
                }
                val url = URL(endpoint)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PATCH"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                val body = if (isPressure) "{\"status\":\"completed\"}" else "{\"status\":\"done\"}"
                conn.outputStream.use { os -> os.write(body.toByteArray()) }
                conn.responseCode
                conn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    fun refreshDataFromServer(context: Context) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, "Syncing Dayly...", Toast.LENGTH_SHORT).show()
        }
        Thread {
            try {
                // Fetch tasks
                val tasksJson = fetchUrl("$BASE_URL/api/tasks?status=todo")
                val pressureJson = fetchUrl("$BASE_URL/api/pressure-tasks?filter=active")
                val habitsJson = fetchUrl("$BASE_URL/api/habits")
                val goalsJson = fetchUrl("$BASE_URL/api/goals")
                val statsJson = fetchUrl("$BASE_URL/api/stats/user")

                val tasksObj = if (tasksJson != null) JSONObject(tasksJson) else null
                val pObj = if (pressureJson != null) JSONObject(pressureJson) else null
                val habitsObj = if (habitsJson != null) JSONObject(habitsJson) else null
                val goalsObj = if (goalsJson != null) JSONObject(goalsJson) else null
                val statsObj = if (statsJson != null) JSONObject(statsJson) else null

                val pList = pObj?.optJSONArray("tasks") ?: JSONArray()
                val nList = tasksObj?.optJSONArray("tasks") ?: JSONArray()

                val combinedTasks = JSONArray()
                // Pressure tasks (max 2)
                for (i in 0 until minOf(2, pList.length())) {
                    val item = pList.getJSONObject(i)
                    val task = JSONObject()
                    task.put("id", item.optString("id"))
                    task.put("title", "🔥 " + item.optString("title"))
                    task.put("progress", 0)
                    task.put("isPressure", true)
                    combinedTasks.put(task)
                }
                // Normal tasks (up to 5 total)
                val remaining = 5 - combinedTasks.length()
                for (i in 0 until minOf(remaining, nList.length())) {
                    val item = nList.getJSONObject(i)
                    val task = JSONObject()
                    task.put("id", item.optString("id"))
                    task.put("title", item.optString("title"))
                    task.put("progress", if (item.optString("status") == "in-progress") 50 else 0)
                    task.put("isPressure", false)
                    combinedTasks.put(task)
                }

                // Habits
                val hList = habitsObj?.optJSONArray("habits") ?: JSONArray()
                val habitsArr = JSONArray()
                for (i in 0 until minOf(3, hList.length())) {
                    val item = hList.getJSONObject(i)
                    val habit = JSONObject()
                    habit.put("title", item.optString("name"))
                    habitsArr.put(habit)
                }

                // Goals
                val gList = goalsObj?.optJSONArray("goals") ?: JSONArray()
                val goalsArr = JSONArray()
                for (i in 0 until gList.length()) {
                    val item = gList.getJSONObject(i)
                    if (item.optString("status") == "active") {
                        val goal = JSONObject()
                        goal.put("title", item.optString("title"))
                        goal.put("icon", item.optString("icon", "💻"))
                        val cur = item.optInt("current_value", 0)
                        val tgt = item.optInt("target_value", 1)
                        val pct = Math.min(100, Math.round((cur.toFloat() / Math.max(1, tgt).toFloat()) * 100))
                        goal.put("progress", pct)
                        goalsArr.put(goal)
                        if (goalsArr.length() >= 3) break
                    }
                }

                // Save to CapacitorStorage
                val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                val editor = prefs.edit()
                editor.putString("widget_tasks", combinedTasks.toString())
                editor.putString("widget_habits", habitsArr.toString())
                editor.putString("widget_goals", goalsArr.toString())

                val userStats = statsObj?.optJSONObject("stats")
                if (userStats != null) {
                    editor.putString("streak_days", userStats.optString("streak_days", "0"))
                    editor.putString("xp", userStats.optString("xp", "0"))
                    editor.putString("avatar_state", userStats.optString("current_avatar_state", "dormant"))
                }
                editor.apply()

                // Notify all widgets
                Handler(Looper.getMainLooper()).post {
                    val manager = AppWidgetManager.getInstance(context)

                    val tIds = manager.getAppWidgetIds(ComponentName(context, TasksWidget::class.java))
                    manager.notifyAppWidgetViewDataChanged(tIds, R.id.widget_tasks_list)
                    for (id in tIds) TasksWidget().onUpdate(context, manager, intArrayOf(id))

                    val gIds = manager.getAppWidgetIds(ComponentName(context, GoalsWidget::class.java))
                    for (id in gIds) GoalsWidget().onUpdate(context, manager, intArrayOf(id))

                    val hIds = manager.getAppWidgetIds(ComponentName(context, HabitsWidget::class.java))
                    for (id in hIds) HabitsWidget().onUpdate(context, manager, intArrayOf(id))

                    val sIds = manager.getAppWidgetIds(ComponentName(context, SunWarriorWidget::class.java))
                    for (id in sIds) SunWarriorWidget().onUpdate(context, manager, intArrayOf(id))

                    Toast.makeText(context, "Dayly Synced ✓", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Handler(Looper.getMainLooper()).post {
                    Toast.makeText(context, "Sync error: check internet", Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
    }

    private fun fetchUrl(urlString: String): String? {
        return try {
            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "GET"
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            text
        } catch (e: Exception) {
            null
        }
    }
}
