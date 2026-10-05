import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

type YouTubePlayerProps = { embedUrl: string; title: string };

export default function YouTubePlayer({ embedUrl, title }: YouTubePlayerProps) {
  return (
    <WebView
      source={{ uri: embedUrl }}
      style={styles.player}
      originWhitelist={['https://www.youtube-nocookie.com']}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      accessibilityLabel={`YouTube player: ${title}`}
    />
  );
}

const styles = StyleSheet.create({
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000' },
});
