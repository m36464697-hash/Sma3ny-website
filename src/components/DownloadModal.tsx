import { useEffect, useState } from 'react';
import {
  Download,
  Scissors,
  CheckCircle2,
  X,
  Music,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  buildProxyDownloadUrl,
  buildProxyStreamUrl,
  clampTrimRange,
  encodeRealPcmSliceToWav,
  formatDuration,
  formatFileSizeMB,
  isDirectCorsAudioUrl,
  isFullResolverRef,
  type MediaTrack,
} from '../utils/mediaLogic';

interface DownloadModalProps {
  track: MediaTrack | null;
  onClose: () => void;
  onRecordDownload: (track: MediaTrack, formatLabel: string, sizeMB?: number) => void;
}

type ModalTab = 'DIRECT' | 'TRIM';

export function DownloadModal({
  track,
  onClose,
  onRecordDownload,
}: DownloadModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('DIRECT');
  const [startedFormat, setStartedFormat] = useState<'mp3' | 'm4a' | 'cdn' | null>(null);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(25);
  const [trimBusy, setTrimBusy] = useState(false);
  const [trimDone, setTrimDone] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('DIRECT');
    setStartedFormat(null);
    setTrimBusy(false);
    setTrimDone(false);
    setTrimError(null);
    if (track) {
      setTrimStart(0);
      setTrimEnd(track.durationSec > 0 ? Math.min(25, track.durationSec) : 25);
    }
  }, [track]);

  if (!track) return null;

  const maxDur = track.durationSec > 0 ? track.durationSec : 600;
  const clampedTrim = clampTrimRange(trimStart, trimEnd, maxDur);
  const isDynamicSong = isFullResolverRef(track.audioUrl);
  const hasDirectCdnMirror = isDirectCorsAudioUrl(track.audioUrl);

  const mp3DownloadHref = buildProxyDownloadUrl(
    track.audioUrl,
    track.title,
    track.artist,
    'mp3'
  );
  const m4aDownloadHref = buildProxyDownloadUrl(
    track.audioUrl,
    track.title,
    track.artist,
    'm4a'
  );
  const sizeText = formatFileSizeMB(track.sizeMB);

  const handleDirectDownloadClick = (fmt: 'mp3' | 'm4a' | 'cdn', label: string) => {
    setStartedFormat(fmt);
    onRecordDownload(track, label, track.sizeMB);
  };

  const handleRealAudioTrim = async () => {
    setTrimBusy(true);
    setTrimDone(false);
    setTrimError(null);

    try {
      let arrayBuffer: ArrayBuffer;
      let sliceOffsetSec = 0;

      if (isDynamicSong) {
        // Fetch only the 2-4 segments covering [startSec, endSec] (~500 KB even on 60-minute songs!)
        const hint = encodeURIComponent(`${track.artist} ${track.title}`.trim());
        const sliceRes = await fetch(
          `/api/sc/trim-source?ref=${encodeURIComponent(track.audioUrl)}&hint=${hint}&start=${clampedTrim.startSec}&end=${clampedTrim.endSec}`
        );
        if (!sliceRes.ok) {
          throw new Error('تعذر جلب الشريحة الصوتية من الأغنية الكاملة.');
        }
        sliceOffsetSec = Number(sliceRes.headers.get('X-Slice-Offset-Sec') || 0);
        arrayBuffer = await sliceRes.arrayBuffer();
      } else {
        // Cap initial MP3 fetch to 6 MB (~6 minutes) so large Surahs never exhaust browser RAM
        const response = await fetch(
          buildProxyStreamUrl(track.audioUrl, 6 * 1024 * 1024)
        );
        if (!response.ok) {
          throw new Error('تعذر جلب البيانات الصوتية الأصلية للقص.');
        }
        arrayBuffer = await response.arrayBuffer();
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      let decodedBuffer: AudioBuffer;
      try {
        decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } finally {
        await audioCtx.close().catch(() => {});
      }

      const localStart = Math.max(0, clampedTrim.startSec - sliceOffsetSec);
      const localEnd = Math.max(localStart + 2, clampedTrim.endSec - sliceOffsetSec);
      const realMaxLocalSec = Math.max(4, Math.floor(decodedBuffer.duration));
      const actualLocalRange = clampTrimRange(localStart, localEnd, realMaxLocalSec);

      const startSample = Math.floor(actualLocalRange.startSec * decodedBuffer.sampleRate);
      const endSample = Math.min(
        decodedBuffer.length,
        Math.floor(actualLocalRange.endSec * decodedBuffer.sampleRate)
      );

      const channelData = decodedBuffer.getChannelData(0);
      const slicedSamples = channelData.subarray(startSample, endSample);
      const wavBytes = encodeRealPcmSliceToWav(slicedSamples, decodedBuffer.sampleRate);

      const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      const cleanTitle =
        track.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'sma3ny-ringtone';

      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${cleanTitle} - نغمة (${actualLocalRange.clipDurationSec}s).wav`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      const trimmedMB = Number((wavBytes.byteLength / (1024 * 1024)).toFixed(1));
      onRecordDownload(
        track,
        `نغمة مقصوصة (${actualLocalRange.clipDurationSec}s)`,
        trimmedMB
      );
      setTrimDone(true);
    } catch {
      setTrimError(
        'تعذر قص النغمة في المتصفح عند هذا التوقيت. جرب اختيار ثوانٍ في بداية المقطع أو نزّل الملف الكامل مباشرة.'
      );
    } finally {
      setTrimBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-dialog-title"
      className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="download-dialog-title"
              className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
            >
              تحميل المقطع الكامل: {track.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              {track.artist} · {track.sourceLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة التحميل"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('DIRECT')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'DIRECT'
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Music className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>تنزيل المقطع الكامل</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('TRIM')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'TRIM'
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Scissors className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>قص كنغمة رنين</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'DIRECT' ? (
            <div className="space-y-3">
              {/* Primary MP3 Full-Length Option */}
              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    ملف صوتي كامل بالمدة الأصلية (<span dir="ltr" className="inline-block">MP3</span>)
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    <span>جودة عالية</span>
                    {track.durationSec > 0 && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono-tabular inline-block">
                          {formatDuration(track.durationSec)}
                        </span>
                      </>
                    )}
                    {sizeText && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono-tabular inline-block">
                          {sizeText}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <a
                  href={mp3DownloadHref}
                  onClick={() => handleDirectDownloadClick('mp3', 'MP3 كامل')}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-11 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    startedFormat === 'mp3'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white'
                  }`}
                >
                  {startedFormat === 'mp3' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>جاري تنزيل MP3</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>
                        تنزيل <span dir="ltr" className="inline-block">MP3</span> الكامل
                      </span>
                    </>
                  )}
                </a>
              </div>

              {/* Fast Native 160kbps M4A Option for Full Songs */}
              {isDynamicSong && (
                <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                      تنزيل فوري فائق السرعة (<span dir="ltr" className="inline-block">M4A · 160 kbps</span>)
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      البث الأصلي الخام بدون إعادة ترميز — يكتمل خلال ثانية واحدة
                    </p>
                  </div>

                  <a
                    href={m4aDownloadHref}
                    onClick={() => handleDirectDownloadClick('m4a', 'M4A أصلي 160k')}
                    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-10 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      startedFormat === 'm4a'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      تنزيل <span dir="ltr" className="inline-block">M4A</span> السريع
                    </span>
                  </a>
                </div>
              )}

              {/* Direct Official CDN Link for Large Surahs */}
              {hasDirectCdnMirror && (
                <div className="pt-1 text-center">
                  <a
                    href={track.audioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleDirectDownloadClick('cdn', 'MP3 خادم مباشر')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>رابط مباشر إضافي من خادم المصحف السريع (للسور ذات الحجم الكبير)</span>
                  </a>
                </div>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center pt-1">
                يتم تنزيل المقطع الصوتي الكامل بمدته الحقيقية الكاملة مباشرة إلى جهازك.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                اختر ثانية البداية والنهاية لاقتطاع نغمة حقيقية صافية مباشرة من الأغنية أو التلاوة الكاملة:
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="trim-start-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    بداية النغمة (ثانية)
                  </label>
                  <input
                    id="trim-start-input"
                    type="number"
                    min={0}
                    max={Math.max(0, maxDur - 2)}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono-tabular text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="trim-end-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    نهاية النغمة (ثانية)
                  </label>
                  <input
                    id="trim-end-input"
                    type="number"
                    min={2}
                    max={maxDur}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono-tabular text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-lg flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>
                  النطاق:{' '}
                  <strong
                    dir="ltr"
                    className="font-mono-tabular text-slate-900 dark:text-white inline-block"
                  >
                    {formatDuration(clampedTrim.startSec)} — {formatDuration(clampedTrim.endSec)}
                  </strong>
                </span>
                <span>
                  المدة:{' '}
                  <strong className="font-mono-tabular text-teal-700 dark:text-teal-400">
                    {clampedTrim.clipDurationSec}
                  </strong>{' '}
                  ثانية
                </span>
              </div>

              {trimError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{trimError}</span>
                </div>
              )}

              <button
                type="button"
                disabled={trimBusy}
                onClick={() => void handleRealAudioTrim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-65 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {trimBusy ? (
                  <span>جاري اقتطاع النغمة من المقطع الكامل...</span>
                ) : trimDone ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>تم قص وتنزيل النغمة الحقيقية بنجاح</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" aria-hidden="true" />
                    <span>قص وتنزيل النغمة الحقيقية</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
