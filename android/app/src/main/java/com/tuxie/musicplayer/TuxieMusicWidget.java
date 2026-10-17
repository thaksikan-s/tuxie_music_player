package com.tuxie.musicplayer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;

import java.io.InputStream;

public final class TuxieMusicWidget extends AppWidgetProvider {
    static final String ACTION_TOGGLE = "com.tuxie.musicplayer.widget.TOGGLE";
    static final String ACTION_PREVIOUS = "com.tuxie.musicplayer.widget.PREVIOUS";
    static final String ACTION_NEXT = "com.tuxie.musicplayer.widget.NEXT";
    static final String ACTION_OPEN = "com.tuxie.musicplayer.widget.OPEN";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        Player player = TuxiePlaybackService.currentPlayer();
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId, player);
    }

    static void updateAll(Context context, @Nullable Player player) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, TuxieMusicWidget.class));
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId, player);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId, @Nullable Player player) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.tuxie_music_widget);
        MediaItem item = player == null ? null : player.getCurrentMediaItem();
        MediaMetadata metadata = item == null ? null : item.mediaMetadata;
        CharSequence title = metadata == null ? null : metadata.title;
        CharSequence artist = metadata == null ? null : metadata.artist;
        boolean hasTrack = item != null || TuxiePlaybackService.hasPersistedQueue(context);

        CharSequence savedTitle = player == null ? TuxiePlaybackService.persistedTitle(context) : null;
        CharSequence savedArtist = player == null ? TuxiePlaybackService.persistedArtist(context) : null;
        views.setTextViewText(R.id.widget_title, nonEmpty(title, nonEmpty(savedTitle, player == null && hasTrack ? "Resume Tuxie music" : hasTrack ? "Unknown track" : "Nothing playing")));
        views.setTextViewText(R.id.widget_artist, nonEmpty(artist, nonEmpty(savedArtist, player == null && hasTrack ? "Tap play to restore your queue" : hasTrack ? "Unknown artist" : "Open Tuxie to choose music")));
        views.setTextViewText(R.id.widget_play, player != null && player.isPlaying() ? "Ⅱ" : "▶");
        views.setContentDescription(R.id.widget_play,
                player != null && player.isPlaying() ? "Pause playback" : "Resume playback");
        views.setOnClickPendingIntent(R.id.widget_previous, hasTrack
                ? serviceAction(context, widgetId, ACTION_PREVIOUS) : activityAction(context, widgetId));
        views.setOnClickPendingIntent(R.id.widget_play, hasTrack
                ? serviceAction(context, widgetId, ACTION_TOGGLE) : activityAction(context, widgetId));
        views.setOnClickPendingIntent(R.id.widget_next, hasTrack
                ? serviceAction(context, widgetId, ACTION_NEXT) : activityAction(context, widgetId));
        PendingIntent open = activityAction(context, widgetId);
        views.setOnClickPendingIntent(R.id.widget_artwork, open);
        views.setOnClickPendingIntent(R.id.widget_title, open);
        views.setOnClickPendingIntent(R.id.widget_artist, open);

        Bitmap artwork = loadArtwork(context, metadata, player == null ? TuxiePlaybackService.persistedArtworkUri(context) : null);
        if (artwork != null) views.setImageViewBitmap(R.id.widget_artwork, artwork);
        else views.setImageViewResource(R.id.widget_artwork, R.mipmap.ic_launcher);
        manager.updateAppWidget(widgetId, views);
    }

    private static Bitmap loadArtwork(Context context, @Nullable MediaMetadata metadata, @Nullable Uri fallbackUri) {
        Uri uri = metadata == null || metadata.artworkUri == null ? fallbackUri : metadata.artworkUri;
        if (uri == null) return null;
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(input, null, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        } catch (Exception error) {
            android.util.Log.w("TuxieWidget", "Album artwork is unavailable to the home-screen widget.", error);
            return null;
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 2;
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            return input == null ? null : BitmapFactory.decodeStream(input, null, options);
        } catch (Exception error) {
            android.util.Log.w("TuxieWidget", "Could not decode album artwork for the widget.", error);
            return null;
        }
    }

    private static PendingIntent serviceAction(Context context, int widgetId, String action) {
        Intent intent = new Intent(context, TuxieWidgetActionReceiver.class)
                .setAction(action)
                .setData(Uri.parse("tuxie-widget://" + widgetId + "/" + action.substring(action.lastIndexOf('.') + 1)));
        return PendingIntent.getBroadcast(context, widgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent activityAction(Context context, int widgetId) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, widgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String nonEmpty(@Nullable CharSequence value, String fallback) {
        return value == null || value.toString().trim().isEmpty() ? fallback : value.toString();
    }
}
