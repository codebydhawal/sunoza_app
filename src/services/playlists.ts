import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Video } from '@/services/auth';

const PLAYLISTS_KEY = 'sunoza_playlists_v1';

export type Playlist = {
  id: string;
  serverId?: number;
  clientKey?: string;
  name: string;
  videos: Video[];
  createdAt: number;
};

export function fromAccountPlaylist(value: import('@/services/auth').PlaylistData): Playlist {
  return {
    id: value.clientKey || String(value.id),
    serverId: value.id,
    clientKey: value.clientKey || String(value.id),
    name: value.name,
    createdAt: Date.parse(value.createdAt) || Date.now(),
    videos: value.videos.map((video) => ({
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
    })),
  };
}

export async function loadPlaylists(): Promise<Playlist[]> {
  const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);
  if (!raw) return [];

  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) return [];

  return value.filter((playlist): playlist is Playlist => (
    typeof playlist === 'object'
    && playlist !== null
    && typeof playlist.id === 'string'
    && typeof playlist.name === 'string'
    && Array.isArray(playlist.videos)
    && typeof playlist.createdAt === 'number'
  ));
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}
