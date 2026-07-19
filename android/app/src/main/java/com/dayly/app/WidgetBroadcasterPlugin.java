package com.dayly.app;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetBroadcaster")
public class WidgetBroadcasterPlugin extends Plugin {

    @PluginMethod
    public void sendUpdate(PluginCall call) {
        try {
            Intent intent = new Intent("com.dayly.WIDGET_UPDATE");
            intent.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e("WidgetBroadcaster", "Failed to broadcast widget update", e);
            call.reject("Failed to broadcast widget update", e);
        }
    }
}
