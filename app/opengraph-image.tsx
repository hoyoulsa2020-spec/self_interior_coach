import { ImageResponse } from "next/og";

export const alt = "셀인코치 - 셀프인테리어 소비자 - 공정별 전문시공업체 중개 플랫폼";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            셀코
          </div>
          <div
            style={{
              width: 88,
              height: 88,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.95)",
              borderRadius: 16,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4f46e5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 21h18" />
              <path d="M5 21V9l7-4 7 4v12" />
              <path d="M9 21v-4h6v4" />
              <path d="M9 13h6" />
              <path d="M9 9h6" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "white",
              letterSpacing: "0.05em",
              opacity: 0.95,
            }}
          >
            셀프 인테리어 코치
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
