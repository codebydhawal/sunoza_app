import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, getPlaybackInfo, getVideoDetails, login, logout, register, restoreSession, searchVideos, type PlaybackInfo, type User, type Video, type VideoDetails } from '@/services/auth';
import YouTubePlayer from '@/components/youtube-player';

type Mode = 'search' | 'login' | 'register' | 'player';

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>('search');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchRemaining, setSearchRemaining] = useState(5);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [nowPlaying, setNowPlaying] = useState<Video | null>(null);
  const [pendingPlayback, setPendingPlayback] = useState<Video | null>(null);

  useEffect(() => {
    let active = true;
    restoreSession().catch(() => null).then((session) => {
      if (active) { setUser(session); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !selectedVideo) return;
    let active = true;
    getVideoDetails(selectedVideo.videoId)
      .then((details) => { if (active) setVideoDetails(details); })
      .catch((cause) => { if (active) setDetailsError(cause instanceof Error ? cause.message : 'Could not load video details.'); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [user, selectedVideo]);

  async function handleSubmit() {
    setError('');
    if (mode === 'register' && !name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (!password) { setError('Please enter your password.'); return; }
    if (mode === 'register' && password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setSubmitting(true);
    try {
      const signedInUser = mode === 'register'
        ? await register(name, email, password)
        : await login(email, password);
      setUser(signedInUser);
      if (pendingPlayback) {
        const requestedVideo = pendingPlayback;
        setPendingPlayback(null);
        await loadPlayback(requestedVideo);
      } else {
        setMode('search');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setPassword('');
    setSearchRemaining(5);
    setSelectedVideo(null);
    setPlayback(null);
    setNowPlaying(null);
    setMode('search');
  }

  function handleSelectVideo(video: Video) {
    setVideoDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    setPlayback(null);
    setPlaybackError('');
    setSelectedVideo(video);
    if (!user) {
      setError('Sign in or create an account to view video details.');
      setMode('login');
    }
  }

  async function loadPlayback(video: Video) {
    setPlaybackLoading(true);
    setPlaybackError('');
    try {
      const info = await getPlaybackInfo(video.videoId);
      setNowPlaying(video);
      setPlayback(info);
      setMode('player');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await logout();
        setUser(null);
        setMode('login');
        setError('Your session expired. Sign in again to play videos.');
      } else {
        setPlaybackError(cause instanceof Error ? cause.message : 'Could not start video playback.');
      }
    } finally {
      setPlaybackLoading(false);
    }
  }

  function handleStartPlayback(video: Video) {
    if (!user) {
      setPendingPlayback(video);
      setError('Sign in or create an account to play this video.');
      setMode('login');
      return;
    }
    void loadPlayback(video);
  }

  async function handleSearch() {
    const cleanQuery = query.trim();
    if (!cleanQuery) { setSearchError('Type an artist, song, or mood to search.'); return; }
    if (!user && searchRemaining <= 0) { setSearchError('You’ve used your 5 guest searches. Sign in or create an account to continue.'); return; }
    setSearching(true);
    setSearchError('');
    try {
      const response = await searchVideos(cleanQuery);
      setVideos(response.result.videos);
      if (!user && response.guestRemaining !== null) setSearchRemaining(response.guestRemaining);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'GUEST_SEARCH_LIMIT_REACHED') {
        setSearchRemaining(0);
        setSearchError('You’ve used your 5 guest searches. Sign in or create an account to continue.');
      } else if (cause instanceof ApiError && cause.status === 401 && user) {
        await logout();
        setUser(null);
        setMode('login');
        setSearchError('Your session expired. Sign in again to search.');
      } else {
        setSearchError(cause instanceof Error ? cause.message : 'Search failed. Please try again.');
      }
    } finally {
      setSearching(false);
    }
  }

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#7257E8" /></SafeAreaView>;
  }

  if (mode === 'player' && nowPlaying && playback) {
    const playingIndex = videos.findIndex((video) => video.videoId === nowPlaying.videoId);
    const previousVideo = playingIndex > 0 ? videos[playingIndex - 1] : null;
    const nextVideo = playingIndex >= 0 && playingIndex < videos.length - 1 ? videos[playingIndex + 1] : null;
    return (
      <SafeAreaView style={styles.playerPage}>
        <View style={styles.playerTopBar}>
          <Pressable onPress={() => setMode('search')} style={styles.playerTopButton}>
            <Text style={styles.playerTopButtonText}>‹  Search results</Text>
          </Pressable>
          <Text style={styles.nowPlayingLabel}>NOW PLAYING</Text>
          <Pressable onPress={handleLogout} style={styles.playerTopButton}>
            <Text style={styles.playerTopButtonText}>Sign out</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.playerContent}>
          {!!playbackError && <Text accessibilityRole="alert" style={styles.playerError}>{playbackError}</Text>}
          <View style={styles.playerSurface}>
            <YouTubePlayer embedUrl={playback.embedUrl} title={playback.title} />
          </View>
          <Text style={styles.youtubeAttribution}>VIDEO FROM YOUTUBE</Text>
          <View style={styles.trackInfo}>
            <View style={styles.trackCopy}>
              <Text style={styles.trackTitle}>{playback.title}</Text>
              <Text style={styles.trackArtist}>{playback.channelTitle ?? nowPlaying.channelTitle}</Text>
            </View>
            {nowPlaying.thumbnailUrl && <Image source={{ uri: nowPlaying.thumbnailUrl }} style={styles.trackArtwork} contentFit="cover" />}
          </View>
          <Text style={styles.playerHint}>Use the player controls above to play, pause, change volume, or turn on captions.</Text>
          <View style={styles.trackNavigation}>
            <Pressable disabled={!previousVideo || playbackLoading} onPress={() => previousVideo && handleStartPlayback(previousVideo)} style={[styles.skipButton, (!previousVideo || playbackLoading) && styles.skipDisabled]}>
              <Text style={styles.skipIcon}>‹</Text><Text style={styles.skipLabel}>Previous</Text>
            </Pressable>
            <View style={styles.playingIndicator}><View style={styles.equalizerBar} /><View style={[styles.equalizerBar, styles.equalizerTall]} /><View style={[styles.equalizerBar, styles.equalizerShort]} /><Text style={styles.playingText}>SUNOZA</Text></View>
            <Pressable disabled={!nextVideo || playbackLoading} onPress={() => nextVideo && handleStartPlayback(nextVideo)} style={[styles.skipButton, (!nextVideo || playbackLoading) && styles.skipDisabled]}>
              <Text style={styles.skipIcon}>›</Text><Text style={styles.skipLabel}>Next</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'search') {
    if (user && selectedVideo) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.searchTopBar}>
            <Pressable onPress={() => { setSelectedVideo(null); setVideoDetails(null); setPlayback(null); }} style={styles.topAction}>
              <Text style={styles.topActionText}>← Back to results</Text>
            </Pressable>
            <Pressable onPress={handleLogout} style={styles.topAction}><Text style={styles.topActionText}>Sign out</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {videoDetails?.thumbnailUrl || selectedVideo.thumbnailUrl ? (
              <Image source={{ uri: videoDetails?.thumbnailUrl ?? selectedVideo.thumbnailUrl }} style={styles.detailThumbnail} contentFit="cover" />
            ) : <View style={styles.detailThumbnailPlaceholder} />}
            {detailsLoading && <ActivityIndicator size="large" color="#7257E8" style={styles.detailLoader} />}
            {!!detailsError && <Text accessibilityRole="alert" style={styles.error}>{detailsError}</Text>}
            <Text style={styles.detailTitle}>{videoDetails?.title ?? selectedVideo.title}</Text>
            <Text style={styles.detailChannel}>{videoDetails?.channelTitle ?? selectedVideo.channelTitle}</Text>
            {!!videoDetails?.duration && <Text style={styles.detailDuration}>Duration · {videoDetails.duration}</Text>}
            {!!playbackError && <Text accessibilityRole="alert" style={styles.error}>{playbackError}</Text>}
            <Pressable disabled={playbackLoading} onPress={() => handleStartPlayback(selectedVideo)} style={[styles.playButton, playbackLoading && styles.disabled]}>
              {playbackLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>▶  Play video</Text>}
            </Pressable>
            {videoDetails && (
              <View style={styles.metricsRow}>
                <Metric label="Views" value={videoDetails.viewCount} />
                <Metric label="Likes" value={videoDetails.likeCount} />
                <Metric label="Comments" value={videoDetails.commentCount} />
              </View>
            )}
            {!!videoDetails?.description && (
              <View style={styles.descriptionCard}>
                <Text style={styles.descriptionHeading}>About this video</Text>
                <Text style={styles.descriptionText}>{videoDetails.description}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.searchTopBar}>
          <View style={styles.brandRowCompact}>
            <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
            <Text style={styles.brand}>sunoza</Text>
          </View>
          {user ? (
            <Pressable onPress={handleLogout} style={styles.topAction}><Text style={styles.topActionText}>Sign out</Text></Pressable>
          ) : (
            <Pressable onPress={() => { setMode('login'); setError(''); }} style={styles.topAction}><Text style={styles.topActionText}>Sign in</Text></Pressable>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.searchContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>YOUR MUSIC, YOUR WAY</Text>
          <Text style={styles.title}>Find your next{ '\n' }favorite.</Text>
          <Text style={styles.subtitle}>Search songs, artists, or a mood.</Text>

          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              placeholder="Try ‘jazz for a rainy day’"
              placeholderTextColor="#9696A3"
              style={styles.searchInput}
              accessibilityLabel="Search songs and artists"
            />
            <Pressable disabled={searching || (!user && searchRemaining <= 0)} onPress={handleSearch} style={[styles.searchButton, (searching || (!user && searchRemaining <= 0)) && styles.disabled]}>
              {searching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Search</Text>}
            </Pressable>
          </View>

          {!user && <Text style={styles.quotaText}>{searchRemaining} of 5 free searches left today</Text>}
          {!!searchError && <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text>}
          {!!playbackError && <Text accessibilityRole="alert" style={styles.error}>{playbackError}</Text>}

          {!user && searchRemaining === 0 && (
            <View style={styles.limitCard}>
              <Text style={styles.limitTitle}>Keep the music going</Text>
              <Text style={styles.limitBody}>Create a free account or sign in to search without the guest limit.</Text>
              <View style={styles.limitActions}>
                <Pressable onPress={() => { setMode('register'); setError(''); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create account</Text></Pressable>
                <Pressable onPress={() => { setMode('login'); setError(''); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Sign in</Text></Pressable>
              </View>
            </View>
          )}

          {videos.length > 0 && <Text style={styles.resultsHeading}>Search results</Text>}
          {videos.map((video) => (
            <View key={video.videoId} style={styles.videoCard}>
              <Pressable onPress={() => handleSelectVideo(video)} accessibilityRole="button" accessibilityLabel={`View details for ${video.title}`} style={({ pressed }) => [styles.videoMain, pressed && styles.pressed]}>
                {video.thumbnailUrl ? <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" /> : <View style={styles.thumbnailPlaceholder} />}
                <View style={styles.videoInfo}>
                  <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
                  <Text style={styles.videoChannel} numberOfLines={1}>{video.channelTitle}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => handleStartPlayback(video)} disabled={playbackLoading} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`} style={[styles.resultPlayButton, playbackLoading && styles.disabled]}>
                {playbackLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.resultPlayIcon}>▶</Text>}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => { setPendingPlayback(null); setMode('search'); }} style={styles.guestBack}><Text style={styles.topActionText}>← Browse as guest</Text></Pressable>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
            <Text style={styles.brand}>sunoza</Text>
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>YOUR MUSIC, YOUR WAY</Text>
            <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
            <Text style={styles.subtitle}>
              {mode === 'login' ? 'Sign in to pick up where you left off.' : 'Join Sunoza and make it yours.'}
            </Text>
          </View>

          {mode === 'register' && (
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          )}
          <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} secureTextEntry returnKeyType="done" onSubmitEditing={handleSubmit} />

          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

          <Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, submitting && styles.disabled]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>}
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{mode === 'login' ? 'New to Sunoza?' : 'Already have an account?'}</Text>
            <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              <Text style={styles.switchLink}>{mode === 'login' ? ' Create account' : ' Sign in'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean; returnKeyType?: 'done'; onSubmitEditing?: () => void;
};

function Field({ label, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...inputProps} style={styles.input} placeholderTextColor="#9696A3" />
    </View>
  );
}

function Metric({ label, value }: { label: string; value?: number | null }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value == null ? '—' : value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F8F7FC' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FC' },
  content: { flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 58 },
  logo: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  brand: { fontSize: 22, fontWeight: '800', letterSpacing: -0.7, color: '#252332' },
  heading: { marginBottom: 30 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: '#7257E8', marginBottom: 11 },
  title: { fontSize: 31, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: '#252332' },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#777583', marginTop: 9 },
  field: { marginBottom: 18 },
  label: { color: '#3C3A48', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { height: 54, borderWidth: 1, borderColor: '#E7E5EE', borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 16, color: '#252332', fontSize: 15 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  primaryButton: { height: 54, borderRadius: 15, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center', marginTop: 6, shadowColor: '#7257E8', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.85 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
  switchText: { color: '#777583', fontSize: 14 },
  switchLink: { color: '#6549DB', fontSize: 14, fontWeight: '700' },
  searchTopBar: { maxWidth: 900, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRowCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topAction: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#EFECFB' },
  topActionText: { color: '#5C46C4', fontSize: 14, fontWeight: '700' },
  searchContent: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 50, paddingBottom: 44 },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  searchInput: { flex: 1, minWidth: 0, height: 54, borderWidth: 1, borderColor: '#E7E5EE', borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 16, color: '#252332', fontSize: 15 },
  searchButton: { minWidth: 104, height: 54, borderRadius: 15, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  quotaText: { marginTop: 12, color: '#777583', fontSize: 13 },
  limitCard: { marginTop: 20, borderRadius: 18, padding: 20, backgroundColor: '#EFECFB' },
  limitTitle: { color: '#252332', fontSize: 17, fontWeight: '800' },
  limitBody: { color: '#777583', fontSize: 14, lineHeight: 21, marginTop: 6 },
  limitActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 },
  resultsHeading: { color: '#252332', fontSize: 19, fontWeight: '800', marginTop: 34, marginBottom: 14 },
  videoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#EFEDF4' },
  videoMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 },
  resultPlayButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7257E8' },
  resultPlayIcon: { color: '#FFFFFF', fontSize: 16, marginLeft: 3 },
  thumbnail: { width: 132, height: 76, borderRadius: 10, backgroundColor: '#E7E5EE' },
  thumbnailPlaceholder: { width: 132, height: 76, borderRadius: 10, backgroundColor: '#E7E5EE' },
  videoInfo: { flex: 1, gap: 7 },
  videoTitle: { color: '#252332', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  videoChannel: { color: '#777583', fontSize: 12 },
  guestBack: { maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 28, paddingTop: 16 },
  detailContent: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  detailThumbnail: { width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: '#E7E5EE' },
  detailThumbnailPlaceholder: { width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: '#E7E5EE' },
  detailLoader: { marginTop: 22 },
  playButton: { height: 52, paddingHorizontal: 20, alignSelf: 'flex-start', minWidth: 170, marginTop: 20, borderRadius: 14, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center' },
  playerPage: { flex: 1, backgroundColor: '#17151F' },
  playerTopBar: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerTopButton: { minWidth: 92, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12, backgroundColor: '#282532' },
  playerTopButtonText: { color: '#E8E4F8', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  nowPlayingLabel: { color: '#AFA8CB', fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  playerContent: { flexGrow: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  playerError: { color: '#FF9B9B', fontSize: 13, marginBottom: 12 },
  playerSurface: { width: '100%', minHeight: 200, overflow: 'hidden', borderRadius: 18, backgroundColor: '#000000' },
  youtubeAttribution: { marginTop: 20, color: '#A99BEF', fontSize: 10, letterSpacing: 1.8, fontWeight: '800' },
  trackInfo: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 13 },
  trackCopy: { flex: 1 },
  trackTitle: { color: '#F7F5FC', fontSize: 23, lineHeight: 29, fontWeight: '800' },
  trackArtist: { color: '#B7B3C2', fontSize: 15, marginTop: 7 },
  trackArtwork: { width: 68, height: 68, borderRadius: 12 },
  playerHint: { color: '#9692A3', fontSize: 12, lineHeight: 18, marginTop: 17 },
  trackNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, paddingVertical: 17, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#24212E' },
  skipButton: { minWidth: 78, alignItems: 'center', justifyContent: 'center', gap: 2 },
  skipDisabled: { opacity: 0.35 },
  skipIcon: { color: '#F7F5FC', fontSize: 30, lineHeight: 32 },
  skipLabel: { color: '#B7B3C2', fontSize: 11, fontWeight: '600' },
  playingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  equalizerBar: { width: 3, height: 10, borderRadius: 2, backgroundColor: '#A99BEF' },
  equalizerTall: { height: 17 },
  equalizerShort: { height: 7 },
  playingText: { color: '#DCD6FF', fontSize: 10, letterSpacing: 1.4, fontWeight: '800', marginLeft: 7 },
  detailTitle: { marginTop: 22, color: '#252332', fontSize: 24, lineHeight: 31, fontWeight: '800' },
  detailChannel: { marginTop: 8, color: '#7257E8', fontSize: 15, fontWeight: '700' },
  detailDuration: { marginTop: 8, color: '#777583', fontSize: 13 },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  metric: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', borderRadius: 14, backgroundColor: '#EFECFB' },
  metricValue: { color: '#252332', fontSize: 15, fontWeight: '800' },
  metricLabel: { marginTop: 4, color: '#777583', fontSize: 12 },
  descriptionCard: { marginTop: 22, padding: 18, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEDF4' },
  descriptionHeading: { color: '#252332', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  descriptionText: { color: '#666472', fontSize: 14, lineHeight: 21 },
  secondaryButton: { marginTop: 32, borderWidth: 1, borderColor: '#DCD8EA', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  secondaryButtonText: { color: '#5745BA', fontWeight: '700', fontSize: 15 },
});
