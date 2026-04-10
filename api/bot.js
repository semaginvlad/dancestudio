import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

// Беремо ключі з Vercel
const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336; // Це твій ID

// ==========================================
// 1. Команда /start
// ==========================================
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  
  let query = supabase.from('groups').select('*');
  if (tgId !== ADMIN_ID) {
    query = query.eq('trainer_tg_id', tgId.toString());
  }
  
  const { data: groups, error } = await query;
  if (error || !groups || groups.length === 0) {
    return ctx.reply('❌ У вас немає доступу або за вами не закріплено жодної групи.');
  }

  const buttons = groups.map(g => [{ text: `💃 ${g.name}`, callback_data: `grp_${g.id}` }]);
  ctx.reply('Привіт! 👋\nОбери групу для відмітки:', { reply_markup: { inline_keyboard: buttons } });
});

// ==========================================
// 2. Список учениць
// ==========================================
bot.action(/grp_(.+)/, async (ctx) => {
  const groupId = ctx.match[1];
  await ctx.answerCbQuery();
  
  // Використовуємо group_id
  const { data: subs } = await supabase.from('subscriptions').select('*').eq('group_id', groupId);
  const { data: students } = await supabase.from('students').select('*');
  
  if (!subs || subs.length === 0) return ctx.reply('У цій групі зараз немає активних абонементів.');

  const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
  
  // Використовуємо end_date, used_trainings, total_trainings
  const activeSubs = subs.filter(s => s.end_date >= today && (s.used_trainings || 0) < (s.total_trainings || 1));
  if (activeSubs.length === 0) return ctx.reply('Немає активних учениць у цій групі (абонементи закінчились).');

  const buttons = activeSubs.map(s => {
    // Використовуємо student_id
    const st = students.find(x => x.id === s.student_id);
    const marker = s.paid ? '🟢' : '🔴'; 
    return [{ 
      text: `${marker} ${st?.name || '?'} (${s.used_trainings || 0}/${s.total_trainings || 1})`, 
      callback_data: `sub_${s.id}` 
    }];
  });

  ctx.reply('Оберіть ученицю:', { reply_markup: { inline_keyboard: buttons } });
});

// ==========================================
// 3. Меню дій
// ==========================================
bot.action(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  ctx.reply('Що робимо?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Відмітити 1 заняття', callback_data: `mark_1_${subId}` }],
        [{ text: '✅✅ Відмітити 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💰 Закрити борг (Оплата)', callback_data: `pay_${subId}` }]
      ]
    }
  });
});

// ==========================================
// 4. Логіка списання
// ==========================================
bot.action(/mark_(\d+)_(.+)/, async (ctx) => {
  const count = parseInt(ctx.match[1]);
  const subId = ctx.match[2];
  await ctx.answerCbQuery();

  try {
    const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    if (!sub) return ctx.reply('❌ Абонемент не знайдено.');

    const { data: student } = await supabase.from('students').select('name').eq('id', sub.student_id).single();

    const newUsed = (sub.used_trainings || 0) + count;
    if (newUsed > sub.total_trainings) {
      return ctx.reply(`⚠️ У ${student?.name} залишилось менше занять, ніж ви намагаєтесь списати!`);
    }

    // Оновлюємо абонемент
    await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);

    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
    
    // Записуємо у відвідування
    await supabase.from('attendance').insert({
      sub_id: subId,
      group_id: sub.group_id,
      date: today,
      quantity: count,
      entry_type: 'subscription'
    });

    ctx.reply(`✅ Списано ${count} заняття: ${student?.name}.\nЗалишок: ${sub.total_trainings - newUsed} з ${sub.total_trainings}`);
  } catch (e) {
    ctx.reply('❌ Помилка при відмітці.');
    console.error(e);
  }
});

// ==========================================
// 5. Оплата
// ==========================================
bot.action(/pay_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();

  ctx.reply('Як саме вона оплатила борг?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 На карту', callback_data: `paid_card_${subId}` }],
        [{ text: '💵 Готівкою', callback_data: `paid_cash_${subId}` }]
      ]
    }
  });
});

// ==========================================
// 6. Збереження оплати
// ==========================================
bot.action(/paid_(card|cash)_(.+)/, async (ctx) => {
  const method = ctx.match[1];
  const subId = ctx.match[2];
  await ctx.answerCbQuery();

  try {
    await supabase.from('subscriptions').update({ paid: true, pay_method: method }).eq('id', subId);
    
    const { data: sub } = await supabase.from('subscriptions').select('student_id').eq('id', subId).single();
    const { data: student } = await supabase.from('students').select('name').eq('id', sub.student_id).single();

    ctx.reply(`✅ Борг закрито! Оплату за ${student?.name} зафіксовано (${method === 'card' ? 'Картка' : 'Готівка'}).`);
  } catch (e) {
    ctx.reply('❌ Помилка збереження оплати.');
  }
});

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
    res.status(200).send('Бот працює! 🕺');
  }
}
