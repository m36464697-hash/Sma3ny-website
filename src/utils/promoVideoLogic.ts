export const PROMO_DURATION_SEC = 45;

export interface PromoScene {
  id: string;
  indexLabel: string;
  startSec: number;
  endSec: number;
  kicker: string;
  headline: string;
  subtitle: string;
  highlights: string[];
  screenshotKey?: 'search' | 'quran' | 'radio' | 'eq';
}

export const PROMO_SCENES: PromoScene[] = [
  {
    id: 'intro',
    indexLabel: '01',
    startSec: 0,
    endSec: 7,
    kicker: 'منصة الصوتيات العربية المتكاملة',
    headline: 'سمعني · Sma3ny',
    subtitle: 'عالمك الصوتي الكامل في مكان واحد — استماع فوري وتحميل مباشر مجاناً وبلا حدود.',
    highlights: ['أغاني كاملة', 'القرآن الكريم 114 سورة', 'إذاعات 24/7'],
  },
  {
    id: 'songs',
    indexLabel: '02',
    startSec: 7,
    endSec: 15,
    kicker: 'محرك بحث واستماع فوري',
    headline: 'الأغاني بمدتها الكاملة وتحميل MP3',
    subtitle: 'ابحث عن أي مطرب أو أغنية واستمع بأعلى نقاء صوتي، أو حمّل المقطع وقص النغمات بضغطة زر.',
    highlights: ['نسخ أصلية كاملة', 'تحميل MP3 فوري', 'قص النغمات بدقة'],
    screenshotKey: 'search',
  },
  {
    id: 'quran',
    indexLabel: '03',
    startSec: 15,
    endSec: 23,
    kicker: 'المصحف المرتل والنص العثماني',
    headline: 'القرآن الكريم كاملاً — 114 سورة',
    subtitle: 'أكثر من 240 قارئاً من كبار القراء مع عرض الآيات بالرسم العثماني متزامنة لحظياً مع التلاوة.',
    highlights: ['244 قارئ متاح', 'تزامن الآيات العثماني', 'تشغيل متواصل وتحميل'],
    screenshotKey: 'quran',
  },
  {
    id: 'radio',
    indexLabel: '04',
    startSec: 23,
    endSec: 31,
    kicker: 'بث حي بدون انقطاع',
    headline: '90 إذاعة مباشرة على مدار الساعة 24/7',
    subtitle: 'إذاعة القرآن الكريم من القاهرة ومكة المكرمة ومحطات أم كلثوم وفيروز وعمرو دياب والصباحيات.',
    highlights: ['إذاعة القاهرة ومكة', 'روائع الطرب الأصيل', 'تشغيل فوري مستقر'],
    screenshotKey: 'radio',
  },
  {
    id: 'studio',
    indexLabel: '05',
    startSec: 31,
    endSec: 39,
    kicker: 'تجربة استماع احترافية',
    headline: 'موازن صوت استوديو EQ وكلمات متزامنة',
    subtitle: 'تحكم كامل في تضخيم الباس (Bass Boost) بـ 5 نطاقات ترددية، قوائم تشغيل خاصة، ومؤقت نوم ذكي.',
    highlights: ['5-Band Equalizer', 'كلمات الأغاني لحظياً', 'قوائم تشغيل وتكرار'],
    screenshotKey: 'eq',
  },
  {
    id: 'outro',
    indexLabel: '06',
    startSec: 39,
    endSec: 45,
    kicker: 'متاح الآن مجاناً على جميع الأجهزة',
    headline: 'ابدأ الاستماع الآن عبر سمعني',
    subtitle: 'يعمل بسرعة فائقة على الهاتف والكمبيوتر والتابلت بدون تسجيل حساب أو اشتراكات.',
    highlights: ['Sma3ny-website.onrender.com'],
  },
];

export interface PromoSceneState {
  scene: PromoScene;
  sceneIndex: number;
  clampedTimeSec: number;
  globalProgress: number;
  localProgress: number;
  enterProgress: number;
  exitProgress: number;
}

export function clampPromoTime(timeSec: number): number {
  if (!Number.isFinite(timeSec) || timeSec <= 0) return 0;
  if (timeSec >= PROMO_DURATION_SEC) return PROMO_DURATION_SEC;
  return timeSec;
}

export function formatPromoTimecode(timeSec: number): string {
  const safe = Math.floor(clampPromoTime(timeSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function validatePromoTimeline(scenes: PromoScene[] = PROMO_SCENES): boolean {
  if (scenes.length === 0) return false;
  if (scenes[0].startSec !== 0) return false;
  for (let i = 0; i < scenes.length; i++) {
    const current = scenes[i];
    if (current.endSec <= current.startSec) return false;
    if (i > 0 && current.startSec !== scenes[i - 1].endSec) return false;
  }
  return scenes[scenes.length - 1].endSec === PROMO_DURATION_SEC;
}

function easeOutCubic(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - clamped, 3);
}

export function getActivePromoScene(timeSec: number): PromoSceneState {
  const clampedTimeSec = clampPromoTime(timeSec);
  let sceneIndex = PROMO_SCENES.findIndex(
    (s, idx) =>
      clampedTimeSec >= s.startSec &&
      (clampedTimeSec < s.endSec || idx === PROMO_SCENES.length - 1)
  );
  if (sceneIndex === -1) {
    sceneIndex = PROMO_SCENES.length - 1;
  }

  const scene = PROMO_SCENES[sceneIndex];
  const duration = Math.max(0.001, scene.endSec - scene.startSec);
  const elapsed = Math.max(0, Math.min(duration, clampedTimeSec - scene.startSec));
  const localProgress = elapsed / duration;
  const enterWindowSec = Math.min(0.75, duration * 0.25);
  const exitWindowSec = Math.min(0.55, duration * 0.2);

  const enterProgress = easeOutCubic(elapsed / enterWindowSec);
  const remaining = duration - elapsed;
  const exitProgress =
    sceneIndex === PROMO_SCENES.length - 1
      ? 1
      : Math.max(0, Math.min(1, remaining / exitWindowSec));

  return {
    scene,
    sceneIndex,
    clampedTimeSec,
    globalProgress: clampedTimeSec / PROMO_DURATION_SEC,
    localProgress,
    enterProgress,
    exitProgress,
  };
}
