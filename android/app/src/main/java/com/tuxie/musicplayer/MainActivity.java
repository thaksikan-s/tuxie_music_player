package com.tuxie.musicplayer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TuxiePlaybackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
