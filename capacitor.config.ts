import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sellincoach.app",
  appName: "셀인코치",
  webDir: "www",
  // 원격 URL 모드: Vercel 배포 URL 사용 (API 라우트 유지)
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://sel-ko.co.kr",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#FFFFFF",
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "light",
    },
  },
};

export default config;
