"use client";

import { useEffect, useState } from "react";
import { pickRandomVideo } from "@/lib/backgroundVideos";
import { WHITE_POSTER } from "@/lib/videoPoster";

type Props = {
  videos: string[];
  overlayClassName?: string;
  wrapperClassName?: string;
};

/** poster로 로드 전 재생 아이콘 대체 (웹·앱 공통) */
export default function VideoOrGradientBackground({
  videos,
  overlayClassName = "bg-black/30",
  wrapperClassName = "fixed inset-0 z-0 bg-black",
}: Props) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    setVideoSrc(pickRandomVideo(videos));
  }, [videos]);

  return (
    <div className={wrapperClassName}>
      {videoSrc ? (
        <>
          <video
            key={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            poster={WHITE_POSTER}
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
