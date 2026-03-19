/** 배경 영상 URL 목록 - 스플래시, 로그인, 회원가입 공통 사용 */

const AUTH_VIDEOS = [
  "https://videos.pexels.com/video-files/3969423/3969423-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/7504609/uhd_25fps.mp4",
  "https://videos.pexels.com/video-files/6474151/6474151-uhd_1440_2560_25fps.mp4",
  "https://videos.pexels.com/video-files/5389610/5389610-uhd_1440_2732_30fps.mp4",
  "https://videos.pexels.com/video-files/5384976/5384976-uhd_2732_1440_30fps.mp4",
  "https://videos.pexels.com/video-files/6285689/6285689-uhd_2560_1440_30fps.mp4",
  "https://videos.pexels.com/video-files/7480745/7480745-uhd_2732_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/14377337/14377337-hd_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/5583012/5583012-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/7646445/7646445-uhd_1440_2560_25fps.mp4",
  "https://videos.pexels.com/video-files/6615303/6615303-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/7816372/7816372-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/7817207/7817207-hd_1080_1920_25fps.mp4",
];

export const LOGIN_VIDEOS = AUTH_VIDEOS;
export const SIGNUP_VIDEOS = AUTH_VIDEOS;
export const SPLASH_VIDEOS = AUTH_VIDEOS;

export const DASHBOARD_VIDEOS = AUTH_VIDEOS;

export function pickRandomVideo(videos: string[]): string {
  return videos[Math.floor(Math.random() * videos.length)];
}
