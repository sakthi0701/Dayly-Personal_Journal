package com.dayly.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.content.ComponentName

/**
 * BootReceiver
 *
 * Fires when the device restarts. Forces a widget refresh so the
 * Sun Warrior widget shows current data immediately after reboot.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, SunWarriorWidget::class.java)
            )
            val widget = SunWarriorWidget()
            widget.onUpdate(context, manager, ids)
        }
    }
}
