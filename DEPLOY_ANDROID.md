# 셀인코치 Android 배포 가이드

## 오늘 할 일 체크리스트

### 1. 빌드 & 설치 (로컬 테스트)

```bash
# 1) Next.js 빌드
npm run build

# 2) Capacitor 동기화 (프로덕션 URL)
npm run cap:prod

# 3) Android Studio에서 실행 (에뮬레이터 또는 실제 기기)
# 또는 터미널에서:
cd android && ./gradlew assembleDebug
# APK 위치: android/app/build/outputs/apk/debug/app-debug.apk
```

### 2. 푸시 알림 확인

- [ ] 앱 설치 후 로그인
- [ ] 대시보드/프로필에서 **알림 설정** 켜기
- [ ] 관리자 채팅에서 메시지 보내기 → 푸시 수신 확인
- [ ] 또는 `/admin/push` 페이지에서 테스트 발송

**필수 확인:**
- `android/app/google-services.json` 존재 (Firebase 프로젝트에서 다운로드)
- Vercel 환경변수: `FIREBASE_SERVICE_ACCOUNT_JSON` 설정됨

### 3. Google Play 스토어 배포

#### 사전 준비

- [ ] **Google Play Console** 계정 ($25 일회성 등록비)
- [ ] **앱 서명용 Keystore** 생성 (최초 1회)

#### Keystore 생성 (최초 1회)

```bash
keytool -genkey -v -keystore android/app/sellincoach-upload-key.keystore -alias sellincoach -keyalg RSA -keysize 2048 -validity 10000
```

비밀번호 입력 후, `android/keystore.properties` 파일 생성:

```properties
storePassword=비밀번호
keyPassword=비밀번호
keyAlias=sellincoach
storeFile=app/sellincoach-upload-key.keystore
```

(keystore 파일은 `android/app/` 폴더에 생성됨)

⚠️ **keystore.properties, .keystore 파일은 절대 Git에 커밋하지 마세요!** (.gitignore에 추가됨)

#### Release 빌드

```bash
npm run build
npm run cap:prod
cd android
./gradlew bundleRelease
```

AAB 파일 위치: `android/app/build/outputs/bundle/release/app-release.aab`

#### Google Play Console 업로드

1. [Google Play Console](https://play.google.com/console) 접속
2. **앱 만들기** (또는 기존 앱 선택)
3. **프로덕션** → **새 버전 만들기**
4. **App bundle 업로드** → `app-release.aab` 선택
5. **출시 노트** 작성
6. **검토** → **출시**

#### 스토어 등록 정보 (최초 1회)

- 앱 이름: 셀인코치
- 짧은 설명 / 전체 설명
- 앱 아이콘 (512x512)
- 기능 그래픽 (1024x500) - 선택
- 개인정보처리방침 URL
- 콘텐츠 등급 설문
- 타겟 연령

---

## 버전 업데이트

다음 배포 시 `android/app/build.gradle`에서:

```gradle
versionCode 2   // 매 배포마다 +1
versionName "1.1"  // 사용자에게 보이는 버전
```

---

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| 푸시 안 옴 | google-services.json 확인, FIREBASE_SERVICE_ACCOUNT_JSON 확인 |
| 빌드 실패 | `cd android && ./gradlew clean` 후 재시도 |
| 서명 오류 | keystore.properties 경로 확인 |
