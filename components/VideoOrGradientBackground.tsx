"use client";

import { useEffect, useState } from "react";
import { pickRandomVideo } from "@/lib/backgroundVideos";

const GRADIENT_STYLE = {
  background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
};

type Props = {
  videos: string[];
  overlayClassName?: string;
  wrapperClassName?: string;
};

/** Capacitor 앱에서는 영상 로드 전 재생 아이콘 노출 방지를 위해 그라데이션만 사용 */
export default function VideoOrGradientBackground({
  videos,
  overlayClassName = "bg-black/30",
  wrapperClassName = "fixed inset-0 z-0 bg-black",
}: Props) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [useGradient, setUseGradient] = useState(false); // SSR/초기: 검은 배경(서버·클라이언트 동일)

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isCap = !!cap?.isNativePlatform?.();
    setUseGradient(isCap);
    if (!isCap) setVideoSrc(pickRandomVideo(videos));
  }, [videos]);

  return (
    <div className={wrapperClassName}>
      {useGradient ? (
        <div className="absolute inset-0" style={GRADIENT_STYLE} aria-hidden />
      ) : videoSrc ? (
        <>
          <video
            key={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
          <div className={`absolute inset-0 ${overlayClassName}`} aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 bg-black" aria-hidden />
      )}
    </div>
  );
}
