package com.tuxie.musicplayer;

final class TuxiePlaybackValues {
    private TuxiePlaybackValues() {}

    static double volumeFraction(int current, int maximum) {
        if (maximum <= 0) return 0;
        return Math.max(0, Math.min(maximum, current)) / (double) maximum;
    }

    static int volumeIndex(double fraction, int maximum) {
        if (maximum <= 0) return 0;
        double bounded = Math.max(0, Math.min(1, fraction));
        return (int) Math.round(bounded * maximum);
    }
}
