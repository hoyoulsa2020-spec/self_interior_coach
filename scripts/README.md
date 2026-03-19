# DB 마이그레이션 스크립트

## 개인고객 RLS 정책 적용

Cursor 터미널에서 한 번만 실행:

```bash
npm run db:apply-consumer-policies
```

### 최초 1회 설정: DATABASE_URL 추가

1. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 선택
2. **Settings** → **Database**
3. **Connection string** 섹션에서 **URI** 복사
4. `.env.local`에 추가:
   ```
   DATABASE_URL=postgresql://postgres.xxxxx:[비밀번호]@aws-0-xx.pooler.supabase.com:6543/postgres
   ```
5. `[비밀번호]`는 Database 비밀번호 (Settings > Database에서 확인/재설정 가능)
