import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const TOKEN_KEY = 'sunoza_access_token';

async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') return window.sessionStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    window.sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type ApiEnvelope<T> = { status: number; message: string; data: T };
export type User = { id: number; name: string; email: string; role: string; status: string };
type AuthResult = { accessToken: string; tokenType: string; expiresIn: number; user: User };
export type Video = {
  videoId: string;
  title: string;
  description?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
};
export type SearchResponse = {
  videos: Video[];
  totalResults: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
export type VideoDetails = Video & {
  channelId?: string;
  duration?: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  youtubeUrl?: string;
  embedUrl?: string;
};
export type PlaybackInfo = { videoId: string; title: string; channelTitle?: string; embedUrl: string; audioStreamUrl?: string | null };
export type Artist = { channelId: string; name: string; thumbnailUrl?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

async function request<T>(path: string, body?: unknown, token?: string, method?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(`Could not reach Sunoza server. Check the server and API address (${API_BASE_URL}).`);
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? 'Something went wrong. Please try again.', response.status);
  }
  if (!payload?.data) throw new Error('The server returned an unexpected response.');
  return payload.data;
}

export type PlaylistVideoData = { videoId: string; title: string; channelTitle?: string; thumbnailUrl?: string };
export type PlaylistData = { id: number; name: string; clientKey: string | null; createdAt: string; videos: PlaylistVideoData[] };

async function authorizedRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const token = await readToken();
  if (!token) throw new ApiError('Sign in to manage playlists.', 401);
  return request<T>(path, body, token, method);
}

export const listAccountPlaylists = () => authorizedRequest<PlaylistData[]>('/rest/playlists');
export const createAccountPlaylist = (name: string, clientKey: string) =>
  authorizedRequest<PlaylistData>('/rest/playlists', { name, clientKey });
export const addAccountPlaylistVideo = (playlistId: number, video: PlaylistVideoData) =>
  authorizedRequest<PlaylistData>(`/rest/playlists/${playlistId}/videos`, video);
export const removeAccountPlaylistVideo = (playlistId: number, videoId: string) =>
  authorizedRequest<PlaylistData>(`/rest/playlists/${playlistId}/videos/${encodeURIComponent(videoId)}`, undefined, 'DELETE');
export const deleteAccountPlaylist = (playlistId: number) =>
  authorizedRequest<{ status: string }>(`/rest/playlists/${playlistId}`, undefined, 'DELETE');

async function saveAuth(result: AuthResult): Promise<User> {
  await writeToken(result.accessToken);
  return result.user;
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const result = await request<AuthResult>('/api/auth/register', {
    name: name.trim(), email: email.trim(), password, role: 'USER',
  });
  return saveAuth(result);
}

export async function login(email: string, password: string): Promise<User> {
  const result = await request<AuthResult>('/api/auth/login', { email: email.trim(), password });
  return saveAuth(result);
}

export async function searchVideos(query: string, channelId?: string): Promise<{ result: SearchResponse; guestRemaining: number | null }> {
  const token = await readToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rest/youtube/search`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query: query.trim(), maxResults: 10, ...(channelId ? { channelId } : {}) }),
    });
  } catch {
    throw new Error(`Could not reach Sunoza server. Check the server and API address (${API_BASE_URL}).`);
  }

  const payload = await response.json().catch(() => null) as (SearchResponse & { code?: string; message?: string }) | null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? 'Search failed. Please try again.', response.status, payload?.code);
  }
  if (!payload || !Array.isArray(payload.videos)) throw new Error('The server returned an unexpected search response.');
  const remainingHeader = response.headers.get('X-Guest-Searches-Remaining');
  return {
    result: payload,
    guestRemaining: remainingHeader === null ? null : Number(remainingHeader),
  };
}

export async function searchArtists(query: string): Promise<Artist[]> {
  return authorizedRequest<Artist[]>(`/rest/artists/search?query=${encodeURIComponent(query.trim())}`);
}

export async function getFavoriteArtists(): Promise<Artist[]> {
  return authorizedRequest<Artist[]>('/rest/artists/favorites');
}

export async function saveFavoriteArtists(artists: Artist[]): Promise<Artist[]> {
  return authorizedRequest<Artist[]>('/rest/artists/favorites', artists, 'PUT');
}

export async function getVideoDetails(videoId: string): Promise<VideoDetails> {
  const token = await readToken();
  if (!token) throw new ApiError('Sign in to view video details.', 401);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rest/youtube/videos?videoId=${encodeURIComponent(videoId)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(`Could not reach Sunoza server. Check the server and API address (${API_BASE_URL}).`);
  }

  const payload = await response.json().catch(() => null) as (VideoDetails & { message?: string }) | null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? 'Could not load video details.', response.status);
  }
  if (!payload || payload.videoId !== videoId) throw new Error('The server returned an unexpected video response.');
  return payload;
}

export async function getPlaybackInfo(videoId: string): Promise<PlaybackInfo> {
  const token = await readToken();
  if (!token) throw new ApiError('Sign in to play videos.', 401);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rest/youtube/videos/${encodeURIComponent(videoId)}/playback`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(`Could not reach Sunoza server. Check the server and API address (${API_BASE_URL}).`);
  }

  const payload = await response.json().catch(() => null) as (PlaybackInfo & { message?: string }) | null;
  if (!response.ok) throw new ApiError(payload?.message ?? 'Could not start video playback.', response.status);
  if (!payload || payload.videoId !== videoId || !payload.embedUrl) {
    throw new Error('The server returned an unexpected playback response.');
  }
  return payload;
}

export async function restoreSession(): Promise<User | null> {
  const token = await readToken();
  if (!token) return null;
  try {
    const user = await request<User>('/api/auth/me', undefined, token);
    return user;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      await removeToken();
    }
    return null;
  }
}

export async function logout(): Promise<void> {
  await removeToken();
}
