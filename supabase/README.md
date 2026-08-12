# Supabase 연결

1. Supabase Dashboard의 **SQL Editor**에서 `schema.sql` 전체를 한 번 실행합니다.
2. **Settings > API Keys**에서 서버용 **Secret key**(`sb_secret_...`)를 만듭니다.
3. Vercel 프로젝트의 **Settings > Environment Variables**에 아래 두 값을 등록합니다.

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

4. Production, Preview 환경에 적용하고 Vercel을 재배포합니다.

`sb_publishable_...` 키는 브라우저용 저권한 키입니다. 이 앱의 서버 저장 계층은 사용자 비밀번호 해시와 세션을 다루므로 publishable 키를 받지 않습니다. Secret key는 GitHub나 브라우저 코드에 저장하지 마세요.
