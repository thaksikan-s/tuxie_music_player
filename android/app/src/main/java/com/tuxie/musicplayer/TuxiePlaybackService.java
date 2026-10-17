package com.tuxie.musicplayer;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class TuxiePlaybackService extends MediaSessionService {
    static final String ACTION_PLAY_QUEUE = "com.tuxie.musicplayer.PLAY_QUEUE";
    static final String ACTION_UPDATE_QUEUE = "com.tuxie.musicplayer.UPDATE_QUEUE";
    static final String ACTION_PAUSE = "com.tuxie.musicplayer.PAUSE";
    static final String ACTION_TOGGLE = "com.tuxie.musicplayer.TOGGLE";
    static final String ACTION_SEEK = "com.tuxie.musicplayer.SEEK";
    static final String ACTION_NEXT = "com.tuxie.musicplayer.NEXT";
    static final String ACTION_PREVIOUS = "com.tuxie.musicplayer.PREVIOUS";
    static final String ACTION_REPEAT = "com.tuxie.musicplayer.REPEAT";
    private static final String PLAYBACK_PREFS = "tuxie_native_playback";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_INDEX = "index";
    private static final String KEY_POSITION = "position";
    private static final String KEY_TITLE = "title";
    private static final String KEY_ARTIST = "artist";
    private static final String KEY_ARTWORK_URI = "artworkUri";

    private static volatile TuxiePlaybackService instance;
    private ExoPlayer player;
    private MediaSession mediaSession;
    private int repeatMode = Player.REPEAT_MODE_OFF;
    private boolean shuffleEnabled;
    private String playbackError = "";

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(
                new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .build(),
                true
        );
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                persistPlaybackState();
                refreshWidget();
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                persistPlaybackState();
                refreshWidget();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                persistPlaybackState();
                refreshWidget();
            }

            @Override
            public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                persistPlaybackState();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                playbackError = error.getErrorCodeName() + ": " + error.getMessage();
                android.util.Log.e("TuxiePlayback", "Media3 could not play the selected track.", error);
                // Preserve a usable session after a missing/corrupt file instead of leaving
                // a foreground service in an unrecoverable error state.
                player.pause();
                refreshWidget();
            }
        });
        mediaSession = new MediaSession.Builder(this, player).build();
        instance = this;
        restorePersistedQueue();
        refreshWidget();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            try {
                if (ACTION_PLAY_QUEUE.equals(action)) {
                    setQueue(intent.getStringExtra("items"), intent.getIntExtra("index", 0),
                            intent.getLongExtra("position", 0L), intent.getBooleanExtra("play", true));
                } else if (ACTION_UPDATE_QUEUE.equals(action)) {
                    boolean resume = player.getPlayWhenReady();
                    setQueue(intent.getStringExtra("items"), 0,
                            intent.getLongExtra("position", player.getCurrentPosition()), resume);
                } else if (ACTION_PAUSE.equals(action)) {
                    player.pause();
                } else if (ACTION_TOGGLE.equals(action)) {
                    if (player.isPlaying()) player.pause(); else player.play();
                } else if (ACTION_SEEK.equals(action)) {
                    player.seekTo(Math.max(0L, intent.getLongExtra("position", 0L)));
                } else if (ACTION_NEXT.equals(action)) {
                    player.seekToNextMediaItem();
                } else if (ACTION_PREVIOUS.equals(action)) {
                    player.seekToPreviousMediaItem();
                } else if (ACTION_REPEAT.equals(action)) {
                    repeatMode = intent.getIntExtra("repeatMode", Player.REPEAT_MODE_OFF);
                    shuffleEnabled = intent.getBooleanExtra("shuffle", false);
                    player.setRepeatMode(repeatMode);
                    // The web layer sends an already ordered queue.  Keep that order stable,
                    // but retain the user's shuffle state for the MediaSession and restored UI.
                    player.setShuffleModeEnabled(false);
                    refreshWidget();
                }
            } catch (JSONException | RuntimeException error) {
                playbackError = error.getMessage() == null ? "Android could not apply the playback command." : error.getMessage();
                android.util.Log.e("TuxiePlayback", "Could not apply native playback command.", error);
                player.pause();
            }
        }
        // Do not let Android discard an active MediaSession just because the WebView task was
        // swiped away.  MediaSessionService owns the foreground notification while playback is
        // active, so the session remains available to the lock screen, Bluetooth and the widget.
        return START_STICKY;
    }

    private void setQueue(String json, int index, long position, boolean playWhenReady) throws JSONException {
        JSONArray rows = new JSONArray(json == null ? "[]" : json);
        if (rows.length() == 0) throw new IllegalArgumentException("The playback queue is empty.");
        java.util.ArrayList<MediaItem> items = new java.util.ArrayList<>(rows.length());
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            String rawUri = row.getString("uri");
            Uri uri = Uri.parse(rawUri);
            if (!"content".equals(uri.getScheme())) {
                throw new IllegalArgumentException("This track is not an accessible Android media item.");
            }
            MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                    .setTitle(row.optString("title", "Unknown track"))
                    .setArtist(row.optString("artist", "Unknown artist"))
                    .setAlbumTitle(row.optString("album", ""));
            String artworkUri = row.optString("artworkUri", "");
            if (!artworkUri.isEmpty()) metadata.setArtworkUri(Uri.parse(artworkUri));
            items.add(new MediaItem.Builder()
                    .setMediaId(row.optString("id", uri.toString()))
                    .setUri(uri)
                    .setMediaMetadata(metadata.build())
                    .build());
        }
        playbackError = "";
        player.setMediaItems(items, Math.max(0, Math.min(index, items.size() - 1)), Math.max(0L, position));
        player.setRepeatMode(repeatMode);
        player.setShuffleModeEnabled(false);
        player.setPlayWhenReady(playWhenReady);
        player.prepare();
        getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).edit()
                .putString(KEY_QUEUE, json)
                .apply();
        persistPlaybackState();
    }

    private void restorePersistedQueue() {
        String savedQueue = getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getString(KEY_QUEUE, "");
        if (savedQueue == null || savedQueue.isEmpty()) return;
        try {
            int index = getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getInt(KEY_INDEX, 0);
            long position = getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getLong(KEY_POSITION, 0L);
            setQueue(savedQueue, index, position, false);
        } catch (JSONException | RuntimeException error) {
            android.util.Log.w("TuxiePlayback", "Saved playback queue could not be restored.", error);
            getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).edit().clear().apply();
        }
    }

    private void persistPlaybackState() {
        if (player == null || player.getMediaItemCount() == 0) return;
        MediaItem item = player.getCurrentMediaItem();
        MediaMetadata metadata = item == null ? MediaMetadata.EMPTY : item.mediaMetadata;
        android.content.SharedPreferences.Editor editor = getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).edit()
                .putInt(KEY_INDEX, Math.max(0, player.getCurrentMediaItemIndex()))
                .putLong(KEY_POSITION, Math.max(0L, player.getCurrentPosition()));
        editor.putString(KEY_TITLE, metadata.title == null ? "" : metadata.title.toString());
        editor.putString(KEY_ARTIST, metadata.artist == null ? "" : metadata.artist.toString());
        editor.putString(KEY_ARTWORK_URI, metadata.artworkUri == null ? "" : metadata.artworkUri.toString());
        editor.apply();
    }

    static boolean hasPersistedQueue(android.content.Context context) {
        String queue = context.getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getString(KEY_QUEUE, "");
        return queue != null && !queue.isEmpty();
    }

    static String persistedTitle(android.content.Context context) {
        return context.getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getString(KEY_TITLE, "");
    }

    static String persistedArtist(android.content.Context context) {
        return context.getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getString(KEY_ARTIST, "");
    }

    @Nullable
    static Uri persistedArtworkUri(android.content.Context context) {
        String rawUri = context.getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE).getString(KEY_ARTWORK_URI, "");
        return rawUri == null || rawUri.isEmpty() ? null : Uri.parse(rawUri);
    }

    JSONObject getState() throws JSONException {
        JSONObject state = new JSONObject();
        MediaItem current = player.getCurrentMediaItem();
        state.put("isPlaying", player.isPlaying());
        state.put("position", Math.max(0L, player.getCurrentPosition()));
        state.put("duration", Math.max(0L, player.getDuration()));
        state.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
        state.put("playbackError", playbackError);
        state.put("shuffle", shuffleEnabled);
        state.put("repeatMode", player.getRepeatMode() == Player.REPEAT_MODE_ONE ? "one"
                : player.getRepeatMode() == Player.REPEAT_MODE_ALL ? "all" : "off");
        state.put("currentId", current == null ? JSONObject.NULL : current.mediaId);
        state.put("currentIndex", player.getCurrentMediaItemIndex());
        JSONArray queue = new JSONArray();
        for (int i = 0; i < player.getMediaItemCount(); i++) {
            queue.put(player.getMediaItemAt(i).mediaId);
        }
        state.put("queue", queue);
        return state;
    }

    private void refreshWidget() {
        if (player != null) TuxieMusicWidget.updateAll(this, player);
    }

    static Player currentPlayer() {
        TuxiePlaybackService service = instance;
        return service == null ? null : service.player;
    }

    static JSONObject currentState() throws JSONException {
        TuxiePlaybackService service = instance;
        return service == null ? new JSONObject()
                .put("isPlaying", false)
                .put("position", 0)
                .put("duration", 0)
                .put("ended", false)
                .put("playbackError", "")
                .put("shuffle", false)
                .put("repeatMode", "off")
                .put("currentId", JSONObject.NULL)
                .put("currentIndex", -1)
                .put("queue", new JSONArray()) : service.getState();
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // Keep audible music alive after the app task is dismissed. A paused player can be
        // recreated from its persisted queue by the widget, rather than holding a service open.
        if (player == null || !player.isPlaying()) stopSelf();
    }

    @Override
    public void onDestroy() {
        persistPlaybackState();
        instance = null;
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        TuxieMusicWidget.updateAll(this, null);
        super.onDestroy();
    }
}
