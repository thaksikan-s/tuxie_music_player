package com.tuxie.musicplayer;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class TuxiePlaybackValuesTest {
    @Test
    public void volumeFractionMapsTheCurrentMediaVolume() {
        assertEquals(0.5, TuxiePlaybackValues.volumeFraction(7, 14), 0.0001);
    }

    @Test
    public void volumeFractionClampsInvalidAndFixedVolumeValues() {
        assertEquals(0, TuxiePlaybackValues.volumeFraction(5, 0), 0.0001);
        assertEquals(0, TuxiePlaybackValues.volumeFraction(-1, 10), 0.0001);
        assertEquals(1, TuxiePlaybackValues.volumeFraction(11, 10), 0.0001);
    }

    @Test
    public void volumeIndexClampsSliderInputToSystemStreamRange() {
        assertEquals(0, TuxiePlaybackValues.volumeIndex(-0.5, 10));
        assertEquals(5, TuxiePlaybackValues.volumeIndex(0.5, 10));
        assertEquals(10, TuxiePlaybackValues.volumeIndex(1.5, 10));
        assertEquals(0, TuxiePlaybackValues.volumeIndex(0.5, 0));
    }
}
