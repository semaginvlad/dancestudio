import { google } from 'googleapis';

export default async function handler(req, res) {
  // Дозволяємо сайту звертатися до цього API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // Vercel іноді дивно зберігає приватні ключі з перенесеннями рядків.
    // Цей код гарантує, що ключ буде правильного формату.
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/"/g, '');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Знаходимо понеділок поточного тижня
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);

    // Беремо події на 2 тижні вперед (щоб вистачило для сітки)
    const twoWeeksLater = new Date(monday);
    twoWeeksLater.setDate(monday.getDate() + 14);

    // ID календаря беремо з Vercel, або використовуємо твій за замовчуванням
    const calendarId = process.env.CALENDAR_ID || 'zhusha3004@gmail.com';

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: monday.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = (response.data.items || [])
      .filter(ev => ev.start?.dateTime) // Відфільтровуємо події на весь день (без конкретного часу)
      .map(ev => ({
        id: ev.id,
        title: ev.summary || 'Без назви',
        start: ev.start.dateTime,
        end: ev.end.dateTime,
        description: ev.description || '',
      }));

    // Кешуємо результат на 15 хвилин, щоб не дьоргати Google щосекунди
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
    res.status(200).json({ events, fetchedAt: new Date().toISOString() });

  } catch (err) {
    console.error('Помилка Google Calendar API:', err);
    res.status(500).json({ error: 'Не вдалося отримати події', details: err.message });
  }
}
