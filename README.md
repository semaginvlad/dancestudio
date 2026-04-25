# 💃 Dance Studio Manager

Система управління абонементами для танцювальної студії.

## Швидкий деплой

### 1. Supabase (база даних)
- Зайди в [Supabase Dashboard](https://supabase.com/dashboard)
- Відкрий свій проект `sorokadance`
- SQL Editor → New Query → вставити вміст файлу `schema.sql` → Run

### 2. GitHub
- Створи новий репозиторій: https://github.com/new
- Назва: `dancestudio`
- Завантаж усі файли цього проєкту в репозиторій

### 3. Vercel (хостинг)
- Зайди на https://vercel.com/new
- Import Git Repository → обери `dancestudio`
- В розділі **Environment Variables** додай:
  - `VITE_SUPABASE_URL` = `https://zccbhmuubaaahthzblpt.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = твій anon key
- Натисни **Deploy**
- Через 1-2 хвилини сайт буде доступний!

### 4. Свій домен (опційно)
- В Vercel: Settings → Domains → додати свій домен
- В реєстратора домену: вказати DNS на Vercel

## Локальний запуск (для розробки)
```bash
npm install
cp .env.example .env.local
# Заповнити .env.local своїми ключами
npm run dev
```

