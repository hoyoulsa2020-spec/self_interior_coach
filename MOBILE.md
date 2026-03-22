# 셀인코치 하이브리드 앱 (Capacitor)

Capacitor를 사용해 iOS/Android 네이티브 앱으로 빌드합니다.  
웹 앱(https://sel-ko.co.kr)을 WebView에서 로드하는 **원격 URL 모드**를 사용합니다.

## 사전 요구사항

- **Android**: [Android Studio](https://developer.android.com/studio) 설치
- **iOS**: macOS + [Xcode](https://developer.apple.com/xcode/) (Windows에서는 iOS 빌드 불가)

## 빌드 및 실행

### 로컬 테스트 (빠른 개발)

```bash
# 1. 터미널 1: 반드시 먼저 실행 (안 하면 연결 오류)
npm run dev

# 2. 터미널 2: dev 서버 뜬 뒤 실행
npm run cap:dev        # Android 에뮬레이터 (10.0.2.2:3000)
npm run cap:dev:ios    # iOS 시뮬레이터 (macOS만)
```

> **실기기**에서 테스트 시: `CAPACITOR_SERVER_URL=http://<내PC_IP>:3000 npm run cap:sync` 후 Android Studio에서 실행

### 프로덕션 (sel-ko.co.kr)

```bash
# Vercel 배포 후 앱에서 sel-ko.co.kr 로드
npm run cap:prod       # Android
```

### 기타

```bash
# 웹 자산 동기화만 (www → android/ios)
npm run cap:sync

# Android Studio / Xcode 직접 열기
npm run cap:android
npm run cap:ios
```

## Supabase Auth 설정

앱에서 로그인/회원가입이 동작하려면 Supabase 대시보드에서 **Redirect URLs**에 다음을 추가하세요.

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 → Authentication → URL Configuration
2. **Redirect URLs**에 추가:
   - `https://sel-ko.co.kr/**` (웹 + 앱 프로덕션)
   - `capacitor://localhost/**` (로컬 개발 시)
   - `http://localhost:3000/**` (로컬 개발 시)

## 푸시 알림

현재 웹 푸시(Web Push)는 앱 WebView에서도 동작할 수 있습니다.  
네이티브 푸시(FCM/APNs)가 필요하면 `@capacitor/push-notifications`를 추가해 별도 연동이 필요합니다.
