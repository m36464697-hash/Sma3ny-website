import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Film, Play, X } from 'lucide-react';
import {
  PROMO_DURATION_SEC,
  PROMO_SCENES,
  formatPromoTimecode,
  getActivePromoScene,
} from '../utils/promoVideoLogic';

interface PromoVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPauseBackgroundAudio: () => void;
}

const PROMO_VIDEO_PATH = '/sma3ny-promo-45s.mp4';

export function PromoVideoModal({
  isOpen,
  onClose,
  onPauseBackgroundAudio,
}: PromoVideoModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeState = getActivePromoScene(currentTime);

  const handleSeekChapter = (startSec: number) => {
    const video = videoRef.current;
    if (!video) return;
    onPauseBackgroundAudio();
    video.currentTime = startSec;
    setCurrentTime(startSec);
    void video.play().catch(() => {
      // Autoplay restriction fallback: user can still press native play
    });
  };

  const handleCopyVideoUrl = async () => {
    try {
      const fullUrl = new URL(PROMO_VIDEO_PATH, window.location.origin).toString();
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2400);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <h2
                id="promo-modal-title"
                className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
              >
                الفيديو الإعلاني الرسمي — سمعني Sma3ny
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>إعلان ترويجي كامل</span>
              <span aria-hidden="true">·</span>
              <span dir="ltr" className="font-mono-tabular inline-block">
                00:{PROMO_DURATION_SEC}
              </span>
              <span aria-hidden="true">·</span>
              <span dir="ltr" className="inline-block">
                HD 720p MP4 + Stereo Audio
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الفيديو الإعلاني"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Video Frame */}
        <div className="bg-slate-950 relative aspect-video w-full">
          <video
            ref={videoRef}
            poster="/sma3ny-promo-poster.jpg"
            controls
            playsInline
            preload="metadata"
            onPlay={() => onPauseBackgroundAudio()}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            className="w-full h-full object-contain bg-slate-950"
          >
            <source src="/sma3ny-promo-45s.webm" type="video/webm; codecs=vp9,opus" />
            <source src={PROMO_VIDEO_PATH} type="video/mp4; codecs=avc1.64001f,mp4a.40.2" />
            متصفحك لا يدعم تشغيل الفيديو المباشر.
          </video>
        </div>

        {/* Interactive 6-Chapter Timeline */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              مشاهد الإعلان (اضغط للانتقال إلى أي مشهد):
            </span>
            <span dir="ltr" className="font-mono-tabular">
              {formatPromoTimecode(currentTime)} / 00:{PROMO_DURATION_SEC}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PROMO_SCENES.map((scene) => {
              const isActive = activeState.scene.id === scene.id;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => handleSeekChapter(scene.startSec)}
                  className={`p-2.5 rounded-lg border text-right transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 dark:border-teal-500 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {scene.indexLabel}
                    </span>
                    <span dir="ltr" className="font-mono-tabular">
                      {formatPromoTimecode(scene.startSec)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold truncate">{scene.kicker}</div>
                </button>
              );
            })}
          </div>

          {/* Primary Download & Quick Actions */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSeekChapter(0)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>تشغيل من البداية</span>
              </button>

              <button
                type="button"
                onClick={handleCopyVideoUrl}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                    <span>تم نسخ الرابط</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>نسخ رابط الفيديو</span>
                  </>
                )}
              </button>
            </div>

            <a
              href={PROMO_VIDEO_PATH}
              download="Sma3ny-Promo-45s.mp4"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-10 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>تحميل الفيديو الإعلاني MP4 (45 ثانية)</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
