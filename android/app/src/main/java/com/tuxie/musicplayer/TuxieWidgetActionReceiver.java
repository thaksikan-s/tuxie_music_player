package com.tuxie.musicplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class TuxieWidgetActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String serviceAction;
        if (TuxieMusicWidget.ACTION_TOGGLE.equals(action)) {
            serviceAction = TuxiePlaybackService.ACTION_TOGGLE;
        } else if (TuxieMusicWidget.ACTION_PREVIOUS.equals(action)) {
            serviceAction = TuxiePlaybackService.ACTION_PREVIOUS;
        } else if (TuxieMusicWidget.ACTION_NEXT.equals(action)) {
            serviceAction = TuxiePlaybackService.ACTION_NEXT;
        } else {
            return;
        }

        // A broadcast receiver may finish before a stopped media service has restored its
        // persisted queue. Let the service perform that work and then apply this command.
        Intent command = new Intent(context, TuxiePlaybackService.class).setAction(serviceAction);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(command);
            else context.startService(command);
        } catch (RuntimeException error) {
            android.util.Log.e("TuxieWidget", "Could not send the playback control to the media service.", error);
        }
    }
}
