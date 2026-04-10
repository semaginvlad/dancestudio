import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

// Беремо ключі з Vercel
const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336; // Це твій ID

// 1. Команда /start
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  
  // Шукаємо групи тренера (або всі, якщо це ти)
  let query = supabase.from('groups').select('*');
  if (tgId !== ADMIN_ID) {
    query = query.eq('trainer_tg_id', tgId.toString());
  }
  
  const { data: groups, error } = await query;
  
  if (error || !groups || groups.length === 0) {
    return ctx.reply('❌ У вас немає доступу або за вами не закріплено жодної групи.');
  }

  const buttons = groups.map(g => [{ text: `💃 ${g.name}`, callback_data: `grp_${g.id}` }]);
  
  ctx.reply('Привіт! 👋\nОбери групу для відмітки:', {
    reply_markup: { inline_keyboard: buttons }
  });
});

// 2. Тренер вибрав групу -> показуємо учениць
bot.action(/grp_(.+)/, async (ctx) => {
  const groupId = ctx.match[1];
  await ctx.answerCbQuery(); // прибираємо годинник на кнопці
  
  // Дістаємо всі активні абонементи цієї групи
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('groupId', groupId);
    
  const { data: students } = await supabase.from('students').select('*');
  
  if (!subs || subs.length === 0) {
    return ctx.reply('У цій групі зараз немає активних абонементів.\nНатисніть /start щоб обрати іншу.');
  }

  const today = new Date().toISOString().split('T')[0];
  const activeSubs = subs.filter(s => s.endDate >= today && (s.usedTrainings || 0) < (s.totalTrainings || 1));

  if (activeSubs.length === 0) {
    return ctx.reply('Немає активних учениць у цій групі.');
  }

  // Формуємо кнопки з ученицями
  const buttons = activeSubs.map(s => {
    const st = students.find(x => x.id === s.studentId);
    const isDebt = !s.paid;
    const marker = isDebt ? '🔴' : '🟢'; // Червоний якщо борг
    return [{ 
      text: `${marker} ${st?.name || '?'} (${s.usedTrainings || 0}/${s.totalTrainings || 1})`, 
      callback_data: `sub_${s.id}` 
    }];
  });

  buttons.push([{ text: '➕ Додати гостя / Пробне', callback_data: `guest_${groupId}` }]);

  ctx.reply('Оберіть ученицю:', {
    reply_markup: { inline_keyboard: buttons }
  });
});

// 3. Тренер вибрав ученицю -> меню дій (поки заглушка)
bot.action(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  ctx.reply('Що робимо?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Відмітити 1 заняття', callback_data: `mark_1_${subId}` }],
        [{ text: '✅✅ Відмітити 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💰 Оплатила сьогодні', callback_data: `pay_${subId}` }]
      ]
    }
  });
});

// Обробник для Vercel Serverless
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (e) {
      console.error(e);
      res.status(500).send('Error');
    }
  } else {
    // Секретний лінк для прив'язки бота до Vercel
    if (req.query.setup === '1') {
      const url = `https://${req.headers.host}/api/bot`;
      await bot.telegram.setWebhook(url);
      res.status(200).send(`Webhook успішно підключено до: ${url} 🚀`);
    } else {
      res.status(200).send('Бот працює! 🕺');
    }
  }
}
