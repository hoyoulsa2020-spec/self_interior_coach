# 셀인코치 하이브리드 앱 (Capacitor)

Capacitor를 사용해 iOS/Android 네이티브 앱으로 빌드합니다.  
웹 앱(https://sel-ko.co.kr)을 WebView에서 로드하는 **원격 URL 모드**를 사용합니다.

## 사전 요구사항

- **Android**: [Android Studio](https://developer.android.com/studio) 설치
- **iOS**: macOS + [Xcode](https://developer.apple.com/xcode/) (Windows에서는 iOS 빌드 불가)

## 빌드 및 실행

```bash
# 웹 자산 동기화 (www → android/ios)
npm run cap:sync

# Android 에뮬레이터/기기에서 실행
npm run cap:android

# iOS 시뮬레이터/기기에서 실행 (macOS만)
npm run cap:ios
```

## Supabase Auth 설정

앱에서 로그인/회원가입이 동작하려면 Supabase 대시보드에서 **Redirect URLs**에 다음을 추가하세요.

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 → Authentication → URL Configuration
2. **Redirect URLs**에 추가:
   - `https://sel-ko.co.kr/**` (웹 + 앱 원격 URL)
   - `capacitor://localhost/**` (로컬 개발 시)

## 환경 변수 (선택)

개발용으로 다른 URL을 쓰려면:

```bash
CAPACITOR_SERVER_URL=https://your-preview.vercel.app npm run cap:android
```

## 푸시 알림

현재 웹 푸시(Web Push)는 앱 WebView에서도 동작할 수 있습니다.  
네이티브 푸시(FCM/APNs)가 필요하면 `@capacitor/push-notifications`를 추가해 별도 연동이 필요합니다.
