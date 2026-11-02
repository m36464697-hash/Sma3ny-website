import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { COVER_IMAGES } from '../data/covers';
import type { CoverType } from '../utils/mediaLogic';

interface MediaArtworkProps {
  coverType: CoverType;
  externalCoverUrl?: string;
  alt: string;
  className?: string;
}

export function MediaArtwork({
  coverType,
  externalCoverUrl,
  alt,
  className = 'w-14 h-14 rounded-lg',
}: MediaArtworkProps) {
  const [externalFailed, setExternalFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);

  // Reset image error flags whenever the track artwork source changes
  useEffect(() => {
    setExternalFailed(false);
    setLocalFailed(false);
  }, [externalCoverUrl, coverType]);

  const activeSrc =
    externalCoverUrl && !externalFailed ? externalCoverUrl : COVER_IMAGES[coverType];

  if (localFailed) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-teal-700 to-slate-800 flex items-center justify-center text-white shrink-0`}
        role="img"
        aria-label={alt}
      >
        <Music className="w-5 h-5 opacity-90" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`${className} overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0`}>
      <img
        src={activeSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => {
          if (externalCoverUrl && !externalFailed) {
            setExternalFailed(true);
          } else {
            setLocalFailed(true);
          }
        }}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
