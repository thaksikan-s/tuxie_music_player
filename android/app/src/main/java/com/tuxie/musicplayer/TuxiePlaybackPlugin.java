package com.tuxie.musicplayer;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(
        name = "TuxiePlayback",
        permissions = {
                @Permission(alias = "audio", strings = {Manifest.permission.READ_MEDIA_AUDIO}),
                @Permission(alias = "legacyAudio", strings = {Manifest.permission.READ_EXTERNAL_STORAGE}),
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        }
)
public final class TuxiePlaybackPlugin extends Plugin {
    private static final String[] PROJECTION = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATE_ADDED
    };

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "audio" : "legacyAudio";
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias(alias, call, "audioPermissionResult");
    }

    @PermissionCallback
    private void audioPermissionResult(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "audio" : "legacyAudio";
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
            return;
        }
        call.resolve(new JSObject().put("granted", true));
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true).put("notRequired", Build.VERSION.SDK_INT < 33);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getContext().getPackageName()));
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Android notification settings could not be opened.", error);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Android app settings could not be opened.", error);
        }
    }

    @PluginMethod
    public void scanLibrary(PluginCall call) {
        if (!hasAudioPermission()) {
            JSObject result = new JSObject();
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }
        int offset = Math.max(0, call.getInt("offset", 0));
        int limit = Math.max(1, Math.min(call.getInt("limit", 200), 500));
        boolean providerPaging = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        try (Cursor cursor = providerPaging
                ? queryLibraryPage(offset, limit + 1)
                : getContext().getContentResolver().query(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        PROJECTION,
                        musicSelection(),
                        null,
                        MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC, " + MediaStore.Audio.Media._ID + " ASC"
                )) {
            call.resolve(createTrackPage(cursor, offset, limit, providerPaging));
        } catch (Exception error) {
            android.util.Log.e("TuxieLibrary", "Could not read a MediaStore library page.", error);
            call.reject("Android could not read the music library.", error);
        }
    }

    @PluginMethod
    public void searchLibrary(PluginCall call) {
        if (!hasAudioPermission()) {
            call.reject("Allow music access before searching the Android library.");
            return;
        }
        String query = call.getString("query", "").trim();
        if (query.isEmpty()) {
            call.reject("Enter a song, artist, or album to search.");
            return;
        }
        String selection = "(" + MediaStore.Audio.Media.TITLE + " LIKE ? OR "
                + MediaStore.Audio.Media.ARTIST + " LIKE ? OR "
                + MediaStore.Audio.Media.ALBUM + " LIKE ?) AND "
                + musicSelection();
        String pattern = "%" + query + "%";
        String[] selectionArgs = {pattern, pattern, pattern};
        try (Cursor cursor = getContext().getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                PROJECTION,
                selection,
                selectionArgs,
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC, " + MediaStore.Audio.Media._ID + " ASC"
        )) {
            call.resolve(createTrackPage(cursor, call.getInt("offset", 0), call.getInt("limit", 100), false));
        } catch (Exception error) {
            call.reject("Android could not search the music library.", error);
        }
    }

    @PluginMethod
    public void getTracks(PluginCall call) {
        if (!hasAudioPermission()) {
            call.reject("Allow music access before restoring Android tracks.");
            return;
        }
        JSArray ids = call.getArray("ids", new JSArray());
        if (ids.length() > 500) {
            call.reject("Restore at most 500 queued tracks at a time.");
            return;
        }
        if (ids.length() == 0) {
            call.resolve(new JSObject().put("tracks", new JSArray()).put("totalCount", 0).put("hasMore", false).put("nextOffset", 0));
            return;
        }
        StringBuilder selection = new StringBuilder(MediaStore.Audio.Media._ID).append(" IN (");
        String[] arguments = new String[ids.length()];
        try {
            for (int i = 0; i < ids.length(); i++) {
                if (i > 0) selection.append(',');
                selection.append('?');
                String rawId = ids.getString(i);
                if (rawId == null || !rawId.startsWith("android:")) {
                    call.reject("The Android track identifier is invalid.");
                    return;
                }
                arguments[i] = rawId.substring("android:".length());
                Long.parseLong(arguments[i]);
            }
            selection.append(") AND ").append(musicSelection());
            try (Cursor cursor = getContext().getContentResolver().query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    PROJECTION,
                    selection.toString(),
                    arguments,
                    MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC, " + MediaStore.Audio.Media._ID + " ASC"
            )) {
                call.resolve(createTrackPage(cursor, 0, ids.length(), false));
            }
        } catch (Exception error) {
            call.reject("Android could not restore the queued music.", error);
        }
    }

    /**
     * Android 11+ MediaStore honours LIMIT/OFFSET itself.  Earlier releases keep
     * the compatibility cursor path, while the web layer still receives only a
     * bounded page.  This avoids repeatedly walking every previous row on modern
     * phones, which was the primary source of large-library scan jank.
     */
    private Cursor queryLibraryPage(int offset, int limit) {
        Bundle queryArgs = new Bundle();
        queryArgs.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, musicSelection());
        queryArgs.putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, new String[]{
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media._ID
        });
        queryArgs.putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION,
                ContentResolver.QUERY_SORT_DIRECTION_ASCENDING);
        queryArgs.putInt(ContentResolver.QUERY_ARG_LIMIT, limit);
        queryArgs.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
        return getContext().getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                PROJECTION,
                queryArgs,
                null
        );
    }

    private JSObject createTrackPage(Cursor cursor, int requestedOffset, int requestedLimit,
                                     boolean providerPaging) throws JSONException {
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        JSArray tracks = new JSArray();
        int offset = Math.max(0, requestedOffset);
        int limit = Math.max(1, Math.min(requestedLimit, 500));
        int total = cursor == null ? 0 : cursor.getCount();
        int start = providerPaging ? offset : Math.min(offset, total);
        if (cursor != null && !providerPaging && start > 0) cursor.moveToPosition(start - 1);
        if (cursor != null) {
            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
            int albumIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
            int durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED);
            while (tracks.length() < limit && cursor.moveToNext()) {
                long id = cursor.getLong(idColumn);
                Uri audioUri = ContentUris.withAppendedId(collection, id);
                JSONObject track = new JSONObject();
                track.put("id", "android:" + id);
                track.put("uri", audioUri.toString());
                track.put("kind", "android");
                track.put("title", nonEmpty(cursor.getString(titleColumn), "Untitled track"));
                track.put("artist", nonEmpty(cursor.getString(artistColumn), "Unknown artist"));
                track.put("album", nonEmpty(cursor.getString(albumColumn), "Unknown album"));
                track.put("duration", Math.max(0L, cursor.getLong(durationColumn)) / 1000.0);
                track.put("dateAdded", Math.max(0L, cursor.getLong(dateAddedColumn)));
                long albumId = cursor.getLong(albumIdColumn);
                track.put("artworkUri", albumId > 0
                        ? ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId).toString()
                        : "");
                tracks.put(track);
            }
        }
        int nextOffset = start + tracks.length();
        // Provider-paged queries request one extra row solely to know whether
        // another bounded bridge call is needed; it is never sent to the WebView.
        boolean hasMore = providerPaging
                ? cursor != null && cursor.moveToNext()
                : nextOffset < total;
        JSObject result = new JSObject();
        result.put("permissionRequired", false);
        result.put("tracks", tracks);
        result.put("totalCount", providerPaging ? -1 : total);
        result.put("nextOffset", nextOffset);
        result.put("hasMore", hasMore);
        return result;
    }

    @PluginMethod
    public void playQueue(PluginCall call) {
        String items = call.getArray("items", new JSArray()).toString();
        int index = call.getInt("index", 0);
        long position = call.getLong("position", 0L);
        boolean play = call.getBoolean("play", true);
        Intent intent = new Intent(getContext(), TuxiePlaybackService.class)
                .setAction(TuxiePlaybackService.ACTION_PLAY_QUEUE)
                .putExtra("items", items)
                .putExtra("index", index)
                .putExtra("position", position)
                .putExtra("play", play);
        try {
            startPlaybackService(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Android could not start music playback. Check that the app is allowed to play media in the background.", error);
        }
    }

    @PluginMethod
    public void updateQueue(PluginCall call) {
        String items = call.getArray("items", new JSArray()).toString();
        Intent intent = new Intent(getContext(), TuxiePlaybackService.class)
                .setAction(TuxiePlaybackService.ACTION_UPDATE_QUEUE)
                .putExtra("items", items)
                .putExtra("position", call.getLong("position", 0L));
        try {
            // Queue updates can arrive just after the app moves to the background. Use
            // the foreground-safe path so Android 8+ cannot reject the command.
            startPlaybackService(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Android could not update the playback queue.", error);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        sendCommand(TuxiePlaybackService.ACTION_PAUSE, null, call);
    }

    @PluginMethod
    public void toggle(PluginCall call) {
        sendCommand(TuxiePlaybackService.ACTION_TOGGLE, null, call);
    }

    @PluginMethod
    public void next(PluginCall call) {
        sendCommand(TuxiePlaybackService.ACTION_NEXT, null, call);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        sendCommand(TuxiePlaybackService.ACTION_PREVIOUS, null, call);
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Intent intent = new Intent().putExtra("position", call.getLong("position", 0L));
        sendCommand(TuxiePlaybackService.ACTION_SEEK, intent, call);
    }

    @PluginMethod
    public void setModes(PluginCall call) {
        int mode = call.getString("repeatMode", "off").equals("one")
                ? androidx.media3.common.Player.REPEAT_MODE_ONE
                : call.getString("repeatMode", "off").equals("all")
                    ? androidx.media3.common.Player.REPEAT_MODE_ALL
                    : androidx.media3.common.Player.REPEAT_MODE_OFF;
        Intent extras = new Intent()
                .putExtra("repeatMode", mode)
                .putExtra("shuffle", call.getBoolean("shuffle", false));
        sendCommand(TuxiePlaybackService.ACTION_REPEAT, extras, call);
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        try {
            call.resolve(new JSObject(TuxiePlaybackService.currentState().toString()));
        } catch (JSONException error) {
            call.reject("Could not read native playback state.", error);
        }
    }

    @PluginMethod
    public void getPlaybackSnapshot(PluginCall call) {
        try {
            JSObject result = new JSObject(TuxiePlaybackService.currentState().toString());
            AudioManager manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            int maximum = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int current = manager.getStreamVolume(AudioManager.STREAM_MUSIC);
            result.put("volumeCurrent", current);
            result.put("volumeMaximum", maximum);
            result.put("volume", TuxiePlaybackValues.volumeFraction(current, maximum));
            result.put("volumeFixed", manager.isVolumeFixed());
            call.resolve(result);
        } catch (JSONException | RuntimeException error) {
            call.reject("Could not read Android playback and media-volume state.", error);
        }
    }

    @PluginMethod
    public void getArtwork(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null || rawUri.isEmpty()) {
            call.reject("An album artwork URI is required.");
            return;
        }
        Bitmap bitmap = null;
        try {
            Uri uri = Uri.parse(rawUri);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new java.io.FileNotFoundException("Album artwork is unavailable.");
                BitmapFactory.decodeStream(stream, null, bounds);
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                call.resolve(new JSObject().put("data", ""));
                return;
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            int largestDimension = Math.max(bounds.outWidth, bounds.outHeight);
            int sampleSize = 1;
            while (largestDimension / (sampleSize * 2) >= 320) {
                sampleSize *= 2;
            }
            options.inSampleSize = sampleSize;
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new java.io.FileNotFoundException("Album artwork is unavailable.");
                bitmap = BitmapFactory.decodeStream(stream, null, options);
            }
            if (bitmap == null) {
                call.resolve(new JSObject().put("data", ""));
                return;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android could not read this album artwork.", error);
        } finally {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
    }

    @PluginMethod
    public void getSystemVolume(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int maximum = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        JSObject result = new JSObject();
        result.put("current", current);
        result.put("maximum", maximum);
        result.put("value", TuxiePlaybackValues.volumeFraction(current, maximum));
        result.put("fixed", audioManager.isVolumeFixed());
        call.resolve(result);
    }

    @PluginMethod
    public void setSystemVolume(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int maximum = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        if (audioManager.isVolumeFixed() || maximum == 0) {
            int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            call.resolve(new JSObject()
                    .put("current", current)
                    .put("maximum", maximum)
                    .put("value", TuxiePlaybackValues.volumeFraction(current, maximum))
                    .put("fixed", true));
            return;
        }
        double value = Math.max(0.0, Math.min(1.0, call.getDouble("value", 0.8)));
        int target = TuxiePlaybackValues.volumeIndex(value, maximum);
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
        int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        JSObject result = new JSObject();
        result.put("current", current);
        result.put("maximum", maximum);
        result.put("value", TuxiePlaybackValues.volumeFraction(current, maximum));
        result.put("fixed", false);
        call.resolve(result);
    }

    private boolean hasAudioPermission() {
        String permission = Build.VERSION.SDK_INT >= 33
                ? Manifest.permission.READ_MEDIA_AUDIO
                : Manifest.permission.READ_EXTERNAL_STORAGE;
        return ContextCompat.checkSelfPermission(getContext(), permission)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private static String musicSelection() {
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0 AND "
                + MediaStore.Audio.Media.DURATION + " > 0";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            selection += " AND " + MediaStore.Audio.Media.IS_PENDING + " = 0";
        }
        return selection;
    }

    private void startPlaybackService(Intent intent) {
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
        else getContext().startService(intent);
    }

    private void sendCommand(String action, Intent extras, PluginCall call) {
        Intent command = new Intent(getContext(), TuxiePlaybackService.class).setAction(action);
        if (extras != null && extras.getExtras() != null) command.putExtras(extras.getExtras());
        try {
            startPlaybackService(command);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Android could not send the playback command to the media service.", error);
        }
    }

    private static String nonEmpty(String value, String fallback) {
        return value == null || value.trim().isEmpty() || value.equals("<unknown>")
                ? fallback : value.trim();
    }
}
