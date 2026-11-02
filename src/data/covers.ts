import quranCover from '../assets/images/cover_quran_recitation_1793602423146.jpg';
import musicCover from '../assets/images/cover_arabic_oud_music_1793602423335.jpg';
import nasheedCover from '../assets/images/cover_islamic_nasheed_1793602424911.jpg';
import khaleejiCover from '../assets/images/cover_khaleeji_session_1793602425810.jpg';
import ringtonesCover from '../assets/images/cover_ringtones_podcast_1793602428060.jpg';
import type { CoverType } from '../utils/mediaLogic';

export const COVER_IMAGES: Record<CoverType, string> = {
  quran: quranCover,
  music: musicCover,
  nasheed: nasheedCover,
  khaleeji: khaleejiCover,
  ringtones: ringtonesCover,
  podcast: ringtonesCover,
};
