import { useCallback, useEffect, useState } from 'react';
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

import { addAccountPlaylistVideo, ApiError, createAccountPlaylist, deleteAccountPlaylist, getFavoriteArtists, getPlaybackInfo, getVideoDetails, listAccountPlaylists, login, logout, register, removeAccountPlaylistVideo, restoreSession, saveFavoriteArtists, searchArtists, searchVideos, type Artist, type PlaybackInfo, type User, type Video, type VideoDetails } from '@/services/auth';
import { fromAccountPlaylist, loadPlaylists, savePlaylists, type Playlist } from '@/services/playlists';
import { SINGER_CATALOG, SINGER_COUNTRIES } from '@/data/singer-catalog';
import YouTubePlayer from '@/components/youtube-player';
import BackgroundAudioPlayer from '@/components/background-audio-player';

type Mode = 'search' | 'playlists' | 'artists' | 'login' | 'register';
type SuggestedSong = { video: Video; artist: Artist };
const normalizeSingerName = (value: string) => value.replace(/\s+-\s+Topic$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

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
  const [playbackOrigin, setPlaybackOrigin] = useState<'search' | 'suggestions' | 'playlist' | 'details' | null>(null);
  const [playbackQueue, setPlaybackQueue] = useState<Video[]>([]);
  const [pendingPlayback, setPendingPlayback] = useState<Video | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistLoading, setPlaylistLoading] = useState(true);
  const [playlistError, setPlaylistError] = useState('');
  const [pendingPlaylistVideo, setPendingPlaylistVideo] = useState<Video | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [pendingPlaybackReturnMode, setPendingPlaybackReturnMode] = useState<'search' | 'playlists'>('search');
  const [favoriteArtists, setFavoriteArtists] = useState<Artist[]>([]);
  const [suggestedSongs, setSuggestedSongs] = useState<SuggestedSong[]>([]);
  const [suggestedArtistCount, setSuggestedArtistCount] = useState(0);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [artistCountry, setArtistCountry] = useState('All countries');
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [artistSaving, setArtistSaving] = useState(false);
  const [artistError, setArtistError] = useState('');

  const handleExpiredSession = useCallback(async (cause: unknown): Promise<boolean> => {
    if (!(cause instanceof ApiError) || cause.status !== 401) return false;
    await logout();
    setUser(null);
    setMode('login');
    setError('Your sign-in expired. Sign in again to save your singers.');
    setArtistError('');
    return true;
  }, []);

  const loadArtistSuggestions = useCallback(async (artists: Artist[], start = 0, append = false) => {
    const batch = artists.slice(start, start + 5);
    if (!batch.length) return;
    setSuggestionsLoading(true); setSuggestionsError('');
    try {
      const results = await Promise.allSettled(batch.map(async (artist) => {
        const response = await searchVideos('songs', artist.channelId);
        return response.result.videos.slice(0, 3).map((video) => ({ video, artist }));
      }));
      const authFailure = results.find((result) => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 401);
      if (authFailure?.status === 'rejected' && await handleExpiredSession(authFailure.reason)) return;
      const songs = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      const uniqueSongs = [...new Map(songs.map((song) => [song.video.videoId, song])).values()];
      setSuggestedSongs((current) => append ? [...current, ...uniqueSongs] : uniqueSongs);
      setSuggestedArtistCount(start + batch.length);
      if (results.every((result) => result.status === 'rejected')) setSuggestionsError('Could not load song suggestions. Try again.');
    } finally { setSuggestionsLoading(false); }
  }, [handleExpiredSession]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [session, local] = await Promise.all([restoreSession(), loadPlaylists()]);
        if (!active) return;
        setUser(session);
        if (session) {
          try {
            const remote = await syncAccountPlaylists(local);
            if (active) setPlaylists(remote);
          } catch {
            if (active) { setPlaylists(local); setPlaylistError('Could not sync playlists. Check your connection and try again.'); }
          }
          try {
            const savedArtists = await getFavoriteArtists();
            if (active) {
              setFavoriteArtists(savedArtists); setSelectedArtists(savedArtists);
              if (savedArtists.length === 0) setMode('artists');
              else void loadArtistSuggestions(savedArtists);
            }
          } catch {
            if (active) setArtistError('Could not load your favorite singers.');
          }
        } else if (active) setPlaylists(local);
      } catch {
        if (active) setPlaylistError('Could not load your saved playlists.');
      } finally {
        if (active) { setPlaylistLoading(false); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [loadArtistSuggestions]);

  async function syncAccountPlaylists(local: Playlist[]): Promise<Playlist[]> {
    for (const playlist of local) {
      const remote = await createAccountPlaylist(playlist.name, playlist.clientKey ?? playlist.id);
      for (const video of playlist.videos) await addAccountPlaylistVideo(remote.id, video);
    }
    const accountPlaylists = (await listAccountPlaylists()).map(fromAccountPlaylist);
    await savePlaylists([]);
    return accountPlaylists;
  }

  function updatePlaylists(next: Playlist[]) {
    setPlaylists(next);
    setPlaylistError('');
    void savePlaylists(next).catch(() => setPlaylistError('Could not save playlist changes on this device.'));
  }

  async function createPlaylist() {
    if (playlistLoading) { setPlaylistError('Your playlists are still loading. Try again in a moment.'); return; }
    const cleanName = playlistName.trim();
    if (!cleanName) { setPlaylistError('Enter a playlist name first.'); return; }
    const newPlaylist: Playlist = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      videos: pendingPlaylistVideo ? [pendingPlaylistVideo] : [],
      createdAt: Date.now(),
    };
    if (user) {
      setPlaylistLoading(true);
      try {
        let remote = await createAccountPlaylist(cleanName, newPlaylist.id);
        if (pendingPlaylistVideo) remote = await addAccountPlaylistVideo(remote.id, pendingPlaylistVideo);
        setPlaylists([fromAccountPlaylist(remote), ...playlists]);
        setPlaylistName(''); setPendingPlaylistVideo(null); setPlaylistError('');
      } catch (cause) { setPlaylistError(cause instanceof Error ? cause.message : 'Could not create playlist.'); }
      finally { setPlaylistLoading(false); }
      return;
    }
    updatePlaylists([newPlaylist, ...playlists]); setPlaylistName(''); setPendingPlaylistVideo(null);
  }

  async function addVideoToPlaylist(playlistId: string) {
    if (!pendingPlaylistVideo) return;
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (target?.videos.some((video) => video.videoId === pendingPlaylistVideo.videoId)) {
      setPlaylistError('This video is already in that playlist.');
      return;
    }
    if (user && target?.serverId) {
      try {
        const updated = await addAccountPlaylistVideo(target.serverId, pendingPlaylistVideo);
        setPlaylists(playlists.map((playlist) => playlist.id === playlistId ? fromAccountPlaylist(updated) : playlist));
        setPendingPlaylistVideo(null); setPlaylistError('');
      } catch (cause) { setPlaylistError(cause instanceof Error ? cause.message : 'Could not add this video.'); }
      return;
    }
    updatePlaylists(playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, videos: [...playlist.videos, pendingPlaylistVideo] }
      : playlist));
    setPendingPlaylistVideo(null);
  }

  async function removeVideoFromPlaylist(playlistId: string, videoId: string) {
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (user && target?.serverId) {
      try {
        const updated = await removeAccountPlaylistVideo(target.serverId, videoId);
        setPlaylists(playlists.map((playlist) => playlist.id === playlistId ? fromAccountPlaylist(updated) : playlist));
        setPlaylistError('');
      } catch (cause) { setPlaylistError(cause instanceof Error ? cause.message : 'Could not remove this video.'); }
      return;
    }
    updatePlaylists(playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, videos: playlist.videos.filter((video) => video.videoId !== videoId) }
      : playlist));
  }

  async function deletePlaylist(playlistId: string) {
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (user && target?.serverId) {
      try { await deleteAccountPlaylist(target.serverId); setPlaylistError(''); }
      catch (cause) { setPlaylistError(cause instanceof Error ? cause.message : 'Could not delete playlist.'); return; }
    }
    updatePlaylists(playlists.filter((playlist) => playlist.id !== playlistId));
  }

  useEffect(() => {
    if (!user || !selectedVideo) return;
    let active = true;
    getVideoDetails(selectedVideo.videoId)
      .then((details) => { if (active) setVideoDetails(details); })
      .catch((cause) => { if (active) setDetailsError(cause instanceof Error ? cause.message : 'Could not load video details.'); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [user, selectedVideo]);

  useEffect(() => {
    if (!user || !selectedVideo) return;
    let active = true;
    getPlaybackInfo(selectedVideo.videoId)
      .then((info) => {
        if (!active) return;
        setNowPlaying(selectedVideo);
        setPlayback({ ...info, embedUrl: info.embedUrl.replace('autoplay=1', 'autoplay=0') });
      })
      .catch((cause) => {
        if (active) setPlaybackError(cause instanceof Error ? cause.message : 'Could not load the video player.');
      })
      .finally(() => { if (active) setPlaybackLoading(false); });
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
    const isRegistration = mode === 'register';
    if (isRegistration) { setSelectedArtists([]); setArtistError(''); }
    try {
      const signedInUser = isRegistration
        ? await register(name, email, password)
        : await login(email, password);
      setUser(signedInUser);
      try {
        const local = await loadPlaylists();
        const synced = await syncAccountPlaylists(local);
        setPlaylists(synced);
        setPlaylistError('');
      } catch {
        setPlaylistError('Signed in, but playlists could not sync. They will retry next time.');
      }
      let savedArtists: Artist[] = [];
      if (!isRegistration) {
        try {
          savedArtists = await getFavoriteArtists();
          setFavoriteArtists(savedArtists);
          setSelectedArtists(savedArtists);
          setSuggestedSongs([]); setSuggestedArtistCount(0);
          if (savedArtists.length > 0) void loadArtistSuggestions(savedArtists);
        } catch { setArtistError('Could not load your favorite singers.'); }
      }
      if (pendingPlayback) {
        const requestedVideo = pendingPlayback;
        setPendingPlayback(null);
        setMode(pendingPlaybackReturnMode);
        await loadPlayback(requestedVideo);
      } else {
        setMode(isRegistration || savedArtists.length === 0 ? 'artists' : 'search');
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
    setFavoriteArtists([]); setSelectedArtists([]);
    setSuggestedSongs([]); setSuggestedArtistCount(0);
    setPlaylists(await loadPlaylists().catch(() => []));
    setPassword('');
    setSearchRemaining(5);
    setSelectedVideo(null);
    setPlayback(null);
    setNowPlaying(null);
    setPlaybackOrigin(null);
    setMode('search');
  }

  function handleSelectVideo(video: Video, queue: Video[] = videos) {
    setVideoDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    setPlayback(null);
    setPlaybackError('');
    setPlaybackLoading(true);
    setPlaybackQueue(queue.some((item) => item.videoId === video.videoId) ? queue : [video]);
    setPlaybackOrigin('details');
    setSelectedVideo(video);
    setMode('search');
    if (!user) {
      setError('Sign in or create an account to view video details.');
      setMode('login');
    }
  }

  async function loadPlayback(video: Video) {
    setPlaybackLoading(true);
    setPlaybackError('');
    setNowPlaying(video);
    setPlayback(null);
    try {
      const info = await getPlaybackInfo(video.videoId);
      setNowPlaying(video);
      setPlayback(info);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await logout();
        setUser(null);
        setNowPlaying(null);
        setPlayback(null);
        setMode('login');
        setError('Your session expired. Sign in again to play videos.');
      } else {
        setPlaybackError(cause instanceof Error ? cause.message : 'Could not start video playback.');
        setNowPlaying(null);
      }
    } finally {
      setPlaybackLoading(false);
    }
  }

  function handleStartPlayback(video: Video, queueOverride?: Video[]) {
    const queue = selectedVideo?.videoId === video.videoId && playbackQueue.some((item) => item.videoId === video.videoId)
      ? playbackQueue
      : queueOverride ?? (mode === 'playlists'
      ? (playlists.find((playlist) => playlist.id === activePlaylistId)?.videos ?? [])
      : videos);
    setPlaybackQueue(queue.some((item) => item.videoId === video.videoId) ? queue : [video]);
    if (selectedVideo?.videoId !== video.videoId) {
      setPlaybackOrigin(queueOverride ? 'suggestions' : mode === 'playlists' ? 'playlist' : 'search');
    }
    if (!user) {
      setPendingPlayback(video);
      setPendingPlaybackReturnMode(mode === 'playlists' ? 'playlists' : 'search');
      setError('Sign in or create an account to play this video.');
      setMode('login');
      return;
    }
    void loadPlayback(video);
  }

  async function handleArtistSearch(singerName: string) {
    const existing = selectedArtists.find((artist) => normalizeSingerName(artist.name) === normalizeSingerName(singerName));
    if (existing) {
      setSelectedArtists((current) => current.filter((artist) => artist.channelId !== existing.channelId));
      return;
    }
    if (selectedArtists.length >= 30) { setArtistError('You can choose up to 30 singers.'); return; }
    setArtistSearching(true); setArtistError('');
    try {
      const matches = await searchArtists(singerName);
      const exactTopic = matches.find((artist) => normalizeSingerName(artist.name) === normalizeSingerName(singerName));
      if (!exactTopic) { setArtistError(`No official Topic channel was found for ${singerName}.`); return; }
      setSelectedArtists((current) => current.some((artist) => artist.channelId === exactTopic.channelId) ? current : [...current, exactTopic]);
    }
    catch (cause) {
      if (!(await handleExpiredSession(cause))) setArtistError(cause instanceof Error ? cause.message : 'Could not search artists.');
    }
    finally { setArtistSearching(false); }
  }

  const visibleSingerCatalog = SINGER_CATALOG.filter((singer) =>
    (artistCountry === 'All countries' || singer.country === artistCountry)
      && (!artistQuery.trim() || `${singer.name} ${singer.country}`.toLocaleLowerCase().includes(artistQuery.trim().toLocaleLowerCase())));

  async function handleSaveArtists() {
    setArtistSaving(true); setArtistError('');
    try {
      const saved = await saveFavoriteArtists(selectedArtists);
      setFavoriteArtists(saved); setSuggestedSongs([]); setSuggestedArtistCount(0);
      if (saved.length > 0) void loadArtistSuggestions(saved);
      setMode('search');
    } catch (cause) {
      if (!(await handleExpiredSession(cause))) setArtistError(cause instanceof Error ? cause.message : 'Could not save your singers.');
    }
    finally { setArtistSaving(false); }
  }

  function playAdjacentVideo(direction: -1 | 1) {
    if (!nowPlaying) return;
    const currentIndex = playbackQueue.findIndex((video) => video.videoId === nowPlaying.videoId);
    const nextVideo = playbackQueue[currentIndex + direction];
    if (!nextVideo) return;
    setPlaybackError('');
    if (selectedVideo) {
      setDetailsLoading(true);
      setPlaybackLoading(true);
      setSelectedVideo(nextVideo);
    } else {
      void loadPlayback(nextVideo);
    }
  }

  function renderPlaybackNavigation(currentVideo: Video) {
    const position = playbackQueue.findIndex((video) => video.videoId === currentVideo.videoId);
    if (playbackQueue.length < 2 || position < 0) return null;
    const previousAvailable = position > 0;
    const nextAvailable = position < playbackQueue.length - 1;
    return (
      <View style={styles.trackNavigation}>
        <Pressable onPress={() => playAdjacentVideo(-1)} disabled={!previousAvailable || playbackLoading} style={[styles.skipButton, (!previousAvailable || playbackLoading) && styles.skipDisabled]} accessibilityRole="button" accessibilityLabel="Play previous video">
          <Text style={styles.skipIcon}>‹</Text><Text style={styles.skipLabel}>Previous</Text>
        </Pressable>
        <Text style={styles.queuePosition}>{position + 1} / {playbackQueue.length}</Text>
        <Pressable onPress={() => playAdjacentVideo(1)} disabled={!nextAvailable || playbackLoading} style={[styles.skipButton, (!nextAvailable || playbackLoading) && styles.skipDisabled]} accessibilityRole="button" accessibilityLabel="Play next video">
          <Text style={styles.skipIcon}>›</Text><Text style={styles.skipLabel}>Next</Text>
        </Pressable>
      </View>
    );
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

  if (mode === 'artists') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.searchTopBar}>
          <View style={styles.brandRowCompact}><View style={styles.logo}><Text style={styles.logoText}>S</Text></View><Text style={styles.brand}>sunoza</Text></View>
          <Pressable onPress={() => setMode('search')} style={styles.topAction}><Text style={styles.topActionText}>Skip</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.artistContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>MAKE SUNOZA YOURS</Text>
          <Text style={styles.title}>Who do you love listening to?</Text>
          <Text style={styles.subtitle}>Search singers from around the world, pick up to 30, and we’ll save them to your account.</Text>
          <View style={styles.searchRow}>
            <TextInput value={artistQuery} onChangeText={setArtistQuery} returnKeyType="search" placeholder="Find a singer in Sunoza’s list" placeholderTextColor="#9696A3" style={styles.searchInput} accessibilityLabel="Filter curated singers" />
          </View>
          <Text style={styles.countryPrompt}>Browse curated singers by country</Text>
          <View style={styles.countryList}>
            {['All countries', ...SINGER_COUNTRIES].map((country) => (
              <Pressable key={country} onPress={() => setArtistCountry(country)} style={[styles.countryChip, artistCountry === country && styles.countryChipSelected]}>
                <Text style={styles.countryChipText}>{country}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.subtitle}>Only listed singers are available. We look for songs on each singer’s YouTube Topic channel.</Text>
          {!!artistError && <Text accessibilityRole="alert" style={styles.error}>{artistError}</Text>}
          <View style={styles.artistGrid}>
            {visibleSingerCatalog.map((singer) => {
              const matched = selectedArtists.find((item) => normalizeSingerName(item.name) === normalizeSingerName(singer.name));
              return (
                <Pressable key={`${singer.country}-${singer.name}`} disabled={artistSearching} onPress={() => { void handleArtistSearch(singer.name); }} style={[styles.artistCard, matched && styles.artistCardSelected]} accessibilityRole="button" accessibilityLabel={`${matched ? 'Remove' : 'Add'} ${singer.name}`}>
                  {matched?.thumbnailUrl ? <Image source={{ uri: matched.thumbnailUrl }} style={styles.artistAvatar} contentFit="cover" /> : <View style={styles.artistAvatarPlaceholder}><Text style={styles.artistInitial}>{singer.name.slice(0, 1).toUpperCase()}</Text></View>}
                  <Text style={styles.artistName} numberOfLines={2}>{singer.name}</Text>
                  <Text style={styles.countryPrompt}>{singer.country}</Text>
                  <Text style={styles.artistSelected}>{artistSearching ? '…' : matched ? '✓ Added' : '+ Add'}</Text>
                </Pressable>
              );
            })}
          </View>
          {selectedArtists.length > 0 && <Text style={styles.subtitle}>{selectedArtists.length} singers selected</Text>}
          <Pressable disabled={artistSaving} onPress={handleSaveArtists} style={[styles.primaryButton, artistSaving && styles.disabled]}>
            {artistSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save singers and continue</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'search') {
    if (user && selectedVideo) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.searchTopBar}>
            <Pressable onPress={() => { setSelectedVideo(null); setVideoDetails(null); setPlayback(null); setNowPlaying(null); setPlaybackOrigin(null); }} style={styles.topAction}>
              <Text style={styles.topActionText}>← Back to results</Text>
            </Pressable>
            <Pressable onPress={handleLogout} style={styles.topAction}><Text style={styles.topActionText}>Sign out</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailPlayerSurface}>
              {playback && nowPlaying?.videoId === selectedVideo.videoId
                ? <YouTubePlayer embedUrl={playback.embedUrl} title={playback.title} />
                : <ActivityIndicator size="large" color="#FFFFFF" />}
            </View>
            <Text style={styles.youtubeAttribution}>VIDEO FROM YOUTUBE</Text>
            {detailsLoading && <ActivityIndicator size="small" color="#7257E8" style={styles.detailLoader} />}
            {!!detailsError && <Text accessibilityRole="alert" style={styles.error}>{detailsError}</Text>}
            <Text style={styles.detailTitle}>{videoDetails?.title ?? selectedVideo.title}</Text>
            <Text style={styles.detailChannel}>{videoDetails?.channelTitle ?? selectedVideo.channelTitle}</Text>
            {!!videoDetails?.duration && <Text style={styles.detailDuration}>Duration · {videoDetails.duration}</Text>}
            {!!playbackError && <Text accessibilityRole="alert" style={styles.error}>{playbackError}</Text>}
            {renderPlaybackNavigation(nowPlaying ?? selectedVideo)}
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
          <View style={styles.topActions}>
            <Pressable onPress={() => { setActivePlaylistId(null); setPendingPlaylistVideo(null); setPlaylistError(''); setMode('playlists'); }} style={styles.topAction}><Text style={styles.topActionText}>Playlists</Text></Pressable>
            {user ? (
              <View style={styles.topActions}>
                <Pressable onPress={() => { setSelectedArtists(favoriteArtists); setMode('artists'); }} style={styles.topAction}><Text style={styles.topActionText}>Artists</Text></Pressable>
                <Pressable onPress={handleLogout} style={styles.topAction}><Text style={styles.topActionText}>Sign out</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setMode('login'); setError(''); }} style={styles.topAction}><Text style={styles.topActionText}>Sign in</Text></Pressable>
            )}
          </View>
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

          {user && favoriteArtists.length > 0 && (
            <View style={styles.suggestionsSection}>
              <Text style={styles.resultsHeading}>Suggested songs for you</Text>
              {suggestionsLoading && suggestedSongs.length === 0 && <ActivityIndicator color="#7257E8" style={styles.playlistLoader} />}
              {!!suggestionsError && <Text accessibilityRole="alert" style={styles.error}>{suggestionsError}</Text>}
              {suggestedSongs.map((suggestion) => {
                const isPlaying = playbackOrigin === 'suggestions' && !selectedVideo && nowPlaying?.videoId === suggestion.video.videoId;
                return (
                  <View key={`${suggestion.artist.channelId}-${suggestion.video.videoId}`} style={[styles.videoCard, isPlaying && styles.expandedVideoCard]}>
                    {isPlaying ? (
                      <>
                        {playback?.videoId === suggestion.video.videoId && playback.audioStreamUrl ? (
                          <BackgroundAudioPlayer
                            streamUrl={playback.audioStreamUrl}
                            title={playback.title}
                            artist={playback.channelTitle ?? suggestion.artist.name}
                            artworkUrl={suggestion.video.thumbnailUrl}
                            onClose={() => { setPlayback(null); setNowPlaying(null); setPlaybackOrigin(null); }}
                          />
                        ) : (
                          <>
                            <View style={styles.resultInlinePlayerSurface}>
                              {playback?.videoId === suggestion.video.videoId ? <YouTubePlayer embedUrl={playback.embedUrl} title={playback.title} /> : <ActivityIndicator size="large" color="#FFFFFF" />}
                            </View>
                            <Text style={styles.youtubeAttribution}>VIDEO FROM YOUTUBE · BACKGROUND AUDIO UNAVAILABLE</Text>
                          </>
                        )}
                        {renderPlaybackNavigation(suggestion.video)}
                        <Pressable onPress={() => { setPlayback(null); setNowPlaying(null); setPlaybackOrigin(null); }} style={styles.closePlayerButton}><Text style={styles.closePlayerText}>Close</Text></Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable onPress={() => handleSelectVideo(suggestion.video, suggestedSongs.map((song) => song.video))} style={styles.videoMain} accessibilityRole="button" accessibilityLabel={`View details for ${suggestion.video.title}`}>
                          {suggestion.video.thumbnailUrl ? <Image source={{ uri: suggestion.video.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" /> : <View style={styles.thumbnailPlaceholder} />}
                          <View style={styles.videoInfo}>
                            <Text style={styles.videoTitle} numberOfLines={2}>{suggestion.video.title}</Text>
                            <Text style={styles.videoChannel} numberOfLines={1}>{suggestion.artist.name}</Text>
                          </View>
                        </Pressable>
                        <Pressable onPress={() => handleStartPlayback(suggestion.video, suggestedSongs.map((song) => song.video))} disabled={playbackLoading} style={[styles.resultPlayButton, playbackLoading && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Play ${suggestion.video.title}`}>
                          {playbackLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.resultPlayIcon}>▶</Text>}
                        </Pressable>
                        <Pressable onPress={() => { setPendingPlaylistVideo(suggestion.video); setPlaylistError(''); }} accessibilityRole="button" accessibilityLabel={`Add ${suggestion.video.title} to a playlist`} style={styles.addToPlaylistButton}><Text style={styles.addToPlaylistIcon}>+</Text></Pressable>
                      </>
                    )}
                  </View>
                );
              })}
              {!suggestionsLoading && suggestedArtistCount < favoriteArtists.length && (
                <Pressable onPress={() => loadArtistSuggestions(favoriteArtists, suggestedArtistCount, true)} style={styles.moreSuggestionsButton}>
                  <Text style={styles.topActionText}>Load more songs</Text>
                </Pressable>
              )}
              {suggestionsLoading && suggestedSongs.length > 0 && <ActivityIndicator color="#7257E8" style={styles.playlistLoader} />}
            </View>
          )}

          {pendingPlaylistVideo && (
            <View style={styles.addToPlaylistPanel}>
              <View style={styles.addToPlaylistHeader}>
                <View style={styles.videoInfo}>
                  <Text style={styles.playlistPanelTitle}>Add to playlist</Text>
                  <Text style={styles.videoChannel} numberOfLines={1}>{pendingPlaylistVideo.title}</Text>
                </View>
                <Pressable onPress={() => { setPendingPlaylistVideo(null); setPlaylistError(''); }} accessibilityRole="button" accessibilityLabel="Close add to playlist">
                  <Text style={styles.closePlayerText}>Close</Text>
                </Pressable>
              </View>
              <View style={styles.createPlaylistRow}>
                <TextInput value={playlistName} onChangeText={setPlaylistName} placeholder="New playlist name" placeholderTextColor="#9696A3" style={styles.playlistNameInput} accessibilityLabel="New playlist name" />
                <Pressable disabled={playlistLoading} onPress={createPlaylist} style={[styles.createPlaylistButton, playlistLoading && styles.disabled]}><Text style={styles.primaryButtonText}>Create</Text></Pressable>
              </View>
              {playlists.map((playlist) => (
                <Pressable key={playlist.id} onPress={() => addVideoToPlaylist(playlist.id)} style={styles.playlistPickerRow}>
                  <Text style={styles.playlistItemName}>{playlist.name}</Text>
                  <Text style={styles.playlistItemMeta}>{playlist.videos.length} videos · Add</Text>
                </Pressable>
              ))}
              {!!playlistError && <Text accessibilityRole="alert" style={styles.error}>{playlistError}</Text>}
            </View>
          )}

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
          {videos.map((video) => {
            const isInlinePlaying = playbackOrigin === 'search' && !selectedVideo && nowPlaying?.videoId === video.videoId;
            return (
              <View key={video.videoId} style={[styles.videoCard, isInlinePlaying && styles.expandedVideoCard]}>
                {isInlinePlaying ? (
                  <>
                    <View style={styles.resultInlinePlayerSurface}>
                      {playback?.videoId === video.videoId
                        ? <YouTubePlayer embedUrl={playback.embedUrl} title={playback.title} />
                        : <ActivityIndicator size="large" color="#FFFFFF" />}
                    </View>
                    <Text style={styles.youtubeAttribution}>VIDEO FROM YOUTUBE</Text>
                    {renderPlaybackNavigation(video)}
                    <Pressable onPress={() => { setPlayback(null); setNowPlaying(null); setPlaybackOrigin(null); }} accessibilityRole="button" accessibilityLabel="Close player" style={styles.closePlayerButton}>
                      <Text style={styles.closePlayerText}>Close</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
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
                    <Pressable onPress={() => { setPendingPlaylistVideo(video); setPlaylistError(''); }} accessibilityRole="button" accessibilityLabel={`Add ${video.title} to a playlist`} style={styles.addToPlaylistButton}>
                      <Text style={styles.addToPlaylistIcon}>+</Text>
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'playlists') {
    const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) ?? null;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.searchTopBar}>
          <Pressable onPress={() => {
            if (activePlaylist) setActivePlaylistId(null);
            else setMode('search');
            setNowPlaying(null);
            setPlayback(null);
          }} style={styles.topAction}>
            <Text style={styles.topActionText}>{activePlaylist ? '← Playlists' : '← Search'}</Text>
          </Pressable>
          {user ? (
            <Pressable onPress={handleLogout} style={styles.topAction}><Text style={styles.topActionText}>Sign out</Text></Pressable>
          ) : (
            <Pressable onPress={() => setMode('login')} style={styles.topAction}><Text style={styles.topActionText}>Sign in</Text></Pressable>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.playlistContent}>
          {activePlaylist ? (
            <>
              <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
              <View style={styles.playlistTitleRow}>
                <Text style={styles.title} numberOfLines={2}>{activePlaylist.name}</Text>
                <Pressable onPress={() => deletePlaylist(activePlaylist.id)} style={styles.deletePlaylistButton}><Text style={styles.deletePlaylistText}>Delete</Text></Pressable>
              </View>
              <Text style={styles.subtitle}>{activePlaylist.videos.length} videos</Text>
              {activePlaylist.videos.length === 0 && <Text style={styles.emptyPlaylistText}>This playlist is empty. Add videos from search results.</Text>}
              {activePlaylist.videos.map((video) => {
                const isInlinePlaying = playbackOrigin === 'playlist' && nowPlaying?.videoId === video.videoId;
                return (
                  <View key={video.videoId} style={[styles.videoCard, isInlinePlaying && styles.expandedVideoCard]}>
                    {isInlinePlaying ? (
                      <>
                        <View style={styles.resultInlinePlayerSurface}>
                          {playback?.videoId === video.videoId
                            ? <YouTubePlayer embedUrl={playback.embedUrl} title={playback.title} />
                            : <ActivityIndicator size="large" color="#FFFFFF" />}
                        </View>
                        <Text style={styles.youtubeAttribution}>VIDEO FROM YOUTUBE</Text>
                        {renderPlaybackNavigation(video)}
                        <View style={styles.playlistPlayerActions}>
                          <Pressable onPress={() => { setPlayback(null); setNowPlaying(null); setPlaybackOrigin(null); }} style={styles.closePlayerButton}><Text style={styles.closePlayerText}>Close</Text></Pressable>
                          <Pressable onPress={() => removeVideoFromPlaylist(activePlaylist.id, video.videoId)} style={styles.removeVideoButton}><Text style={styles.removeVideoText}>Remove from playlist</Text></Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <Pressable onPress={() => handleSelectVideo(video)} style={styles.videoMain} accessibilityRole="button" accessibilityLabel={`View details for ${video.title}`}>
                          {video.thumbnailUrl ? <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" /> : <View style={styles.thumbnailPlaceholder} />}
                          <View style={styles.videoInfo}>
                            <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
                            <Text style={styles.videoChannel} numberOfLines={1}>{video.channelTitle}</Text>
                          </View>
                        </Pressable>
                        <Pressable onPress={() => handleStartPlayback(video)} disabled={playbackLoading} style={[styles.resultPlayButton, playbackLoading && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`}>
                          {playbackLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.resultPlayIcon}>▶</Text>}
                        </Pressable>
                        <Pressable onPress={() => removeVideoFromPlaylist(activePlaylist.id, video.videoId)} style={styles.removeVideoButton} accessibilityRole="button" accessibilityLabel={`Remove ${video.title} from playlist`}><Text style={styles.removeVideoText}>×</Text></Pressable>
                      </>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
              <Text style={styles.title}>Your playlists</Text>
              <Text style={styles.subtitle}>{user ? 'Playlists sync with your account.' : 'Playlists are saved on this device until you sign in.'}</Text>
              <View style={styles.createPlaylistRow}>
                <TextInput value={playlistName} onChangeText={setPlaylistName} placeholder="Name your playlist" placeholderTextColor="#9696A3" style={styles.playlistNameInput} accessibilityLabel="Playlist name" />
                <Pressable disabled={playlistLoading} onPress={createPlaylist} style={[styles.createPlaylistButton, playlistLoading && styles.disabled]}><Text style={styles.primaryButtonText}>Create</Text></Pressable>
              </View>
              {playlistLoading && <ActivityIndicator color="#7257E8" style={styles.playlistLoader} />}
              {!!playlistError && <Text accessibilityRole="alert" style={styles.error}>{playlistError}</Text>}
              {!playlistLoading && playlists.length === 0 && <Text style={styles.emptyPlaylistText}>No playlists yet. Create one, then add videos from search.</Text>}
              {playlists.map((playlist) => (
                <View key={playlist.id} style={styles.playlistCard}>
                  <Pressable onPress={() => setActivePlaylistId(playlist.id)} style={styles.playlistOpenButton} accessibilityRole="button" accessibilityLabel={`Open playlist ${playlist.name}`}>
                    <Text style={styles.playlistItemName}>{playlist.name}</Text>
                    <Text style={styles.playlistItemMeta}>{playlist.videos.length} videos  ›</Text>
                  </Pressable>
                  <Pressable onPress={() => deletePlaylist(playlist.id)} style={styles.deletePlaylistButton} accessibilityRole="button" accessibilityLabel={`Delete playlist ${playlist.name}`}><Text style={styles.deletePlaylistText}>Delete</Text></Pressable>
                </View>
              ))}
            </>
          )}
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandRowCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topAction: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#EFECFB' },
  topActionText: { color: '#5C46C4', fontSize: 14, fontWeight: '700' },
  searchContent: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 50, paddingBottom: 44 },
  artistContent: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 34, paddingBottom: 44 },
  countryPrompt: { color: '#777583', fontSize: 13, fontWeight: '700', marginTop: 20 },
  countryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  countryChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: '#EFECFB' },
  countryChipSelected: { backgroundColor: '#DDD6FF' },
  countryChipText: { color: '#5C46C4', fontSize: 12, fontWeight: '700' },
  artistGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginTop: 22 },
  artistCard: { width: '48%', minHeight: 138, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEDF4', alignItems: 'center', justifyContent: 'center', gap: 7 },
  artistCardSelected: { borderColor: '#7257E8', backgroundColor: '#F1EEFF' },
  artistAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#E7E5EE' },
  artistAvatarPlaceholder: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFECFB' },
  artistInitial: { color: '#6549DB', fontSize: 24, fontWeight: '800' },
  artistName: { color: '#252332', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  artistSelected: { color: '#6549DB', fontSize: 12, fontWeight: '700' },
  favoriteArtistsSection: { marginTop: 12 },
  favoriteArtistList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  favoriteArtistChip: { width: 86, alignItems: 'center', gap: 5, paddingVertical: 8 },
  favoriteArtistAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E7E5EE' },
  favoriteArtistAvatarPlaceholder: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFECFB' },
  favoriteArtistName: { color: '#3C3A48', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  searchInput: { flex: 1, minWidth: 0, height: 54, borderWidth: 1, borderColor: '#E7E5EE', borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 16, color: '#252332', fontSize: 15 },
  searchButton: { minWidth: 104, height: 54, borderRadius: 15, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  quotaText: { marginTop: 12, color: '#777583', fontSize: 13 },
  suggestionsSection: { marginTop: 4 },
  moreSuggestionsButton: { alignSelf: 'center', marginTop: 8, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#EFECFB' },
  limitCard: { marginTop: 20, borderRadius: 18, padding: 20, backgroundColor: '#EFECFB' },
  limitTitle: { color: '#252332', fontSize: 17, fontWeight: '800' },
  limitBody: { color: '#777583', fontSize: 14, lineHeight: 21, marginTop: 6 },
  limitActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 },
  addToPlaylistPanel: { marginTop: 18, padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEDF4' },
  addToPlaylistHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playlistPanelTitle: { color: '#252332', fontSize: 16, fontWeight: '800' },
  createPlaylistRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 12 },
  playlistNameInput: { flex: 1, minWidth: 0, height: 48, borderWidth: 1, borderColor: '#E7E5EE', borderRadius: 13, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#252332', fontSize: 14 },
  createPlaylistButton: { minWidth: 88, height: 48, borderRadius: 13, backgroundColor: '#7257E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  playlistPickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#EFEDF4' },
  playlistItemName: { color: '#252332', fontSize: 15, fontWeight: '700' },
  playlistItemMeta: { color: '#777583', fontSize: 12 },
  addToPlaylistButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#DCD8EA', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  addToPlaylistIcon: { color: '#6549DB', fontSize: 24, lineHeight: 26, fontWeight: '500' },
  playlistContent: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 44 },
  playlistTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  playlistLoader: { marginTop: 24 },
  playlistCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 16, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEDF4' },
  playlistOpenButton: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  deletePlaylistButton: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#FDECEC' },
  deletePlaylistText: { color: '#B42318', fontSize: 12, fontWeight: '700' },
  emptyPlaylistText: { color: '#777583', fontSize: 14, lineHeight: 21, marginTop: 24 },
  playlistPlayerActions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeVideoButton: { minWidth: 40, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#FDECEC' },
  removeVideoText: { color: '#B42318', fontSize: 13, fontWeight: '700' },
  resultsHeading: { color: '#252332', fontSize: 19, fontWeight: '800', marginTop: 34, marginBottom: 14 },
  videoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#EFEDF4' },
  expandedVideoCard: { flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0, backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 },
  resultInlinePlayerSurface: { width: '100%', maxWidth: 480, alignSelf: 'center', aspectRatio: 16 / 9, minHeight: 200, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  closePlayerButton: { alignSelf: 'flex-end', borderRadius: 12, marginTop: 8, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#EFECFB' },
  closePlayerText: { color: '#5C46C4', fontSize: 12, fontWeight: '700' },
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
  detailPlayerSurface: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: 18, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  detailLoader: { marginTop: 12 },
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
  queuePosition: { color: '#DCD6FF', fontSize: 13, fontWeight: '700' },
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
