import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

type BackgroundAudioPlayerProps = {
  streamUrl: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  onClose: () => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export default function BackgroundAudioPlayer({ streamUrl, title, artist, artworkUrl, onClose }: BackgroundAudioPlayerProps) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    player.replace(streamUrl);
    return () => {
      player.pause();
      player.setActiveForLockScreen(false);
    };
  }, [player, streamUrl]);

  function togglePlayback() {
    if (status.playing) {
      player.pause();
      return;
    }
    player.setActiveForLockScreen(true, { title, artist, artworkUrl });
    player.play();
  }

  const progress = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;

  return (
    <View style={styles.container} accessibilityLabel={`Audio player for ${title}`}>
      <View style={styles.heading}>
        <View style={styles.trackInfo}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close audio player" style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.controls}>
        <Text style={styles.time}>{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
        <Pressable onPress={togglePlayback} disabled={status.isBuffering} accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause audio' : 'Play audio'} style={styles.playButton}>
          <Text style={styles.playText}>{status.isBuffering ? '…' : status.playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', padding: 16, borderRadius: 16, backgroundColor: '#252230' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackInfo: { flex: 1, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  artist: { color: '#C4BED8', fontSize: 13 },
  closeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#393545' },
  closeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#504B5D', marginTop: 18, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#8B72FF' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  time: { color: '#C4BED8', fontSize: 12 },
  playButton: { minWidth: 72, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#7257E8' },
  playText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
