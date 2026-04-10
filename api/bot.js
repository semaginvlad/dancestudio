import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336;

// Функція для розбивки кнопок на колонки
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

// ==========================================
// 1. Команда /start
// ==========================================
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  let query = supabase.from('groups').select('*');
  if (tgId !== ADMIN_ID) query = query.eq('trainer_tg_id', tgId.toString());
  
  const { data: groups, error } = await query;
  if (error || !groups || groups.length === 0) return ctx.reply('❌ Немає доступу.');

  // Робимо кнопки у 2 колонки
  const buttons = groups.map(g => ({ text: `💃 ${g.name}`, callback_data: `grp_${g.id}` }));
  const rows = chunk(buttons, 2);

  ctx.reply('Привіт! 👋\nОбери групу:', { reply_markup: { inline_keyboard: rows } });
});

// ==========================================
// 2. Список учениць
// ==========================================
bot.action(/grp_(.+)/, async (ctx) => {
  const groupId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const { data: subs } = await supabase.from('subscriptions').select('*').eq('group_id', groupId);
  const { data: students } = await supabase.from('students').select('*');
  
  if (!subs || subs.length === 0) return ctx.editMessageText('У цій групі порожньо.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start_menu' }]] } });

  const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
  const activeSubs = subs.filter(s => s.end_date >= today && (s.used_trainings || 0) < (s.total_trainings || 1));
  
  if (activeSubs.length === 0) return ctx.editMessageText('Немає активних учениць.');

  const buttons = activeSubs.map(s => {
    const st = students.find(x => x.id === s.student_id);
    const marker = s.paid ? '🟢' : '🔴'; 
    return { text: `${marker} ${st?.name || '?'} (${s.used_trainings || 0}/${s.total_trainings || 1})`, callback_data: `sub_${s.id}` };
  });

  // Пакуємо по 2 в ряд
  const rows = chunk(buttons, 2);
  
  // Редагуємо поточне повідомлення замість відправки нового
  ctx.editMessageText('Оберіть ученицю:', { reply_markup: { inline_keyboard: rows } }).catch(() => {});
});

// ==========================================
// 3. Меню дій для учениці
// ==========================================
bot.action(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  // Дістаємо groupId, щоб зробити кнопку "Назад"
  const { data: sub } = await supabase.from('subscriptions').select('group_id, student_id').eq('id', subId).single();
  const { data: student } = await supabase.from('students').select('name').eq('id', sub?.student_id).single();

  ctx.editMessageText(`👩 ${student?.name || 'Учениця'}\nЩо робимо?`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ 1 заняття', callback_data: `mark_1_${subId}` }, { text: '✅✅ 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💳 Внести оплату', callback_data: `pay_menu_${subId}` }],
        [{ text: '🔙 Назад до списку', callback_data: `grp_${sub?.group_id}` }]
      ]
    }
  }).catch(() => {});
});

// ==========================================
// 4. Логіка списання (тихе повідомлення)
// ==========================================
bot.action(/mark_(\d+)_(.+)/, async (ctx) => {
  const count = parseInt(ctx.match[1]);
  const subId = ctx.match[2];

  try {
    const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    const newUsed = (sub.used_trainings || 0) + count;
    
    if (newUsed > sub.total_trainings) {
      return ctx.answerCbQuery(`⚠️ Недостатньо занять на балансі!`, { show_alert: true });
    }

    await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);
    
    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
    await supabase.from('attendance').insert({ sub_id: subId, group_id: sub.group_id, date: today, quantity: count, entry_type: 'subscription' });

    // Спливаюче повідомлення (Toast), яке зникне саме
    const left = sub.total_trainings - newUsed;
    await ctx.answerCbQuery(`✅ Списано ${count}. Залишок: ${left}`, { show_alert: false });

    // Повертаємо тренера назад до списку групи
    ctx.editMessageText(`✅ Відмічено. Оберіть наступну ученицю:`, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 До списку групи', callback_data: `grp_${sub.group_id}` }]] }
    }).catch(() => {});

  } catch (e) {
    ctx.answerCbQuery('❌ Помилка бази', { show_alert: true });
  }
});

// ==========================================
// 5. Нове меню оплат
// ==========================================
bot.action(/pay_menu_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const { data: sub } = await supabase.from('subscriptions').select('group_id').eq('id', subId).single();

  ctx.editMessageText('Оберіть формат:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Разове (300 грн)', callback_data: `newpay_dropin_${subId}` }, { text: 'Пробне (150 грн)', callback_data: `newpay_trial_${subId}` }],
        [{ text: '4 зан.', callback_data: `newpay_4_${subId}` }, { text: '8 зан.', callback_data: `newpay_8_${subId}` }, { text: '12 зан.', callback_data: `newpay_12_${subId}` }],
        [{ text: '🔙 Назад', callback_data: `sub_${subId}` }]
      ]
    }
  }).catch(() => {});
});

// ==========================================
// 6. Заглушка для нових оплат
// ==========================================
bot.action(/newpay_(.+)/, async (ctx) => {
  // Поки що просто показуємо попап. Далі тут буде логіка створення нового абонемента в базі.
  await ctx.answerCbQuery('В розробці: тут буде створення нового абонемента в базі 🚀', { show_alert: true });
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (e) {
      res.status(500).send('Error');
    }
  } else {
    res.status(200).send('Бот працює! 🕺');
  }
}
