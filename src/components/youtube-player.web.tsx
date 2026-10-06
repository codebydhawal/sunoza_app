import type { CSSProperties } from 'react';

type YouTubePlayerProps = { embedUrl: string; title: string };

export default function YouTubePlayer({ embedUrl, title }: YouTubePlayerProps) {
  const style: CSSProperties = {
    display: 'block',
    width: '100%',
    aspectRatio: '16 / 9',
    minHeight: 200,
    border: 0,
    borderRadius: 16,
    backgroundColor: '#000000',
  };

  return (
    <iframe
      title={`YouTube player: ${title}`}
      src={embedUrl}
      style={style}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
