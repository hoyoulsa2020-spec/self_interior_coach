import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GoogleAnalytics from "./components/GoogleAnalytics";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import CapacitorSafeArea from "./components/CapacitorSafeArea";
import AppInstallTracker from "./components/AppInstallTracker";
import AppPushPermissionPrompt from "./components/AppPushPermissionPrompt";
import AppViewportHeight from "./components/AppViewportHeight";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  /* resizes-content: 키보드 올라오면 viewport가 줄어듦. iOS에서 더 안정적 */
  interactiveWidget: "resizes-content",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ICON_VERSION = "2";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "셀인코치",
  description: "셀인코치 - 셀프인테리어 소비자 - 공정별 전문시공업체 중개 플랫폼",
  icons: { icon: `/icon-192.png?v=${ICON_VERSION}` },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "셀인코치",
    title: "셀인코치",
    description: "셀인코치 - 셀프인테리어 소비자 - 공정별 전문시공업체 중개 플랫폼",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "셀인코치",
    description: "셀인코치 - 셀프인테리어 소비자 - 공정별 전문시공업체 중개 플랫폼",
  },
  appleWebApp: {
    capable: true,
    title: "셀코",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" style={{ colorScheme: "light" }}>
      <head>
        <meta name="naver-site-verification" content="574fddbf9014ac75233a2c902d381ebc031414ce" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          id="safe-area-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var c=window.Capacitor;if(!(c&&c.isNativePlatform&&c.isNativePlatform()))return;var p=(c.getPlatform&&c.getPlatform())||"";var r=document.documentElement;r.style.setProperty("--safe-top","40px");r.style.setProperty("--safe-bottom",p==="ios"?"env(safe-area-inset-bottom, 0px)":"0px");if(document.body){document.body.setAttribute("data-app-mode","true");if(p==="android")document.body.setAttribute("data-app-android","true");}})();`,
          }}
        />
        <GoogleAnalytics />
        <CapacitorSafeArea />
        <AppInstallTracker />
        <AppPushPermissionPrompt />
        <AppViewportHeight />
        <div className="app-viewport">
          {children}
        </div>
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
