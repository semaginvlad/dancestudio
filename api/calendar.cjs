import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Поточний тиждень — від найближчого понеділка, 2 тижні вперед
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Нд, 1=Пн...
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);

    const twoWeeksLater = new Date(monday);
    twoWeeksLater.setDate(monday.getDate() + 14);

    const response = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: monday.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = (response.data.items || [])
      .filter(ev => ev.start?.dateTime) // тільки події з часом (не весь день)
      .map(ev => ({
        id: ev.id,
        title: ev.summary || '',
        start: ev.start.dateTime,
        end: ev.end.dateTime,
        description: ev.description || '',
      }));

    // Кеш 15 хв на Vercel Edge
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
    res.status(200).json({ events, fetchedAt: new Date().toISOString() });

  } catch (err) {
    console.error('Calendar API error:', err);
    res.status(500).json({ error: 'Не вдалося отримати події з календаря' });
  }
}
