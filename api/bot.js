import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336;

// 1. Команда /start
bot.start(async (ctx) => {
  try {
    const tgId = ctx.from.id;
    let query = supabase.from('groups').select('*');
    if (tgId !== ADMIN_ID) query = query.eq('trainer_tg_id', tgId.toString());

    const { data: groups, error } = await query;
    if (error) return ctx.reply(`🚨 Помилка БД (групи): ${error.message}`);
    if (!groups || groups.length === 0) return ctx.reply('❌ Немає доступу до груп.');

    const buttons = groups.map(g => [{ text: `💃 ${g.name}`, callback_data: `grp_${g.id}` }]);
    ctx.reply('Обери групу для відмітки:', { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    ctx.reply(`🚨 Критична помилка: ${e.message}`);
  }
});

// 2. Список учениць
bot.action(/grp_(.+)/, async (ctx) => {
  try {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery();

    // Запит абонементів
    const { data: subs, error: subsError } = await supabase.from('subscriptions').select('*').eq('groupId', groupId);
    if (subsError) return ctx.reply(`🚨 Помилка БД (абонементи): ${subsError.message}`);

    // Запит учениць
    const { data: students, error: stdError } = await supabase.from('students').select('*');
    if (stdError) return ctx.reply(`🚨 Помилка БД (учениці): ${stdError.message}`);

    if (!subs || subs.length === 0) return ctx.reply('В базі порожньо: для цієї групи немає жодного абонемента.');

    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
    const activeSubs = subs.filter(s => s.endDate >= today && (s.usedTrainings || 0) < (s.totalTrainings || 1));

    if (activeSubs.length === 0) return ctx.reply(`Знайдено абонементів: ${subs.length}, але всі вони або протерміновані, або закінчились заняття.`);

    const buttons = activeSubs.map(s => {
      const st = students.find(x => x.id === s.studentId);
      const marker = s.paid ? '🟢' : '🔴';
      return [{ text: `${marker} ${st?.name || '?'} (${s.usedTrainings || 0}/${s.totalTrainings || 1})`, callback_data: `sub_${s.id}` }];
    });

    ctx.reply('Оберіть ученицю:', { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    ctx.reply(`🚨 Критична помилка: ${e.message}`);
  }
});

// 3. Меню дій
bot.action(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  ctx.reply('Що робимо?', {
    reply_markup: { inline_keyboard: [
      [{ text: '✅ Відмітити 1 заняття', callback_data: `mark_1_${subId}` }],
      [{ text: '✅✅ Відмітити 2 заняття', callback_data: `mark_2_${subId}` }],
      [{ text: '💰 Оплатила сьогодні', callback_data: `pay_${subId}` }]
    ]}
  });
});

// 4. Логіка списання
bot.action(/mark_(\d+)_(.+)/, async (ctx) => {
  try {
    const count = parseInt(ctx.match[1]);
    const subId = ctx.match[2];
    await ctx.answerCbQuery();

    const { data: sub, error: subErr } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    if (subErr) return ctx.reply(`🚨 Помилка пошуку абонемента: ${subErr.message}`);

    const { data: student } = await supabase.from('students').select('name').eq('id', sub.studentId).single();
    const newUsed = (sub.usedTrainings || 0) + count;
    
    if (newUsed > sub.totalTrainings) return ctx.reply(`⚠️ У ${student?.name} залишилось менше занять!`);

    await supabase.from('subscriptions').update({ usedTrainings: newUsed }).eq('id', subId);
    
    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
    await supabase.from('attendance').insert({ subId: subId, groupId: sub.groupId, date: today, quantity: count, entryType: 'subscription' });

    ctx.reply(`✅ Списано ${count} заняття: ${student?.name || 'Учениця'}.\nЗалишок: ${sub.totalTrainings - newUsed} з ${sub.totalTrainings}`);
  } catch (e) {
    ctx.reply(`🚨 Помилка відмітки: ${e.message}`);
  }
});

// 5. Логіка оплати
bot.action(/pay_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  ctx.reply('Як саме вона оплатила борг?', {
    reply_markup: { inline_keyboard: [
      [{ text: '💳 На карту', callback_data: `paid_card_${subId}` }],
      [{ text: '💵 Готівкою', callback_data: `paid_cash_${subId}` }]
    ]}
  });
});

bot.action(/paid_(card|cash)_(.+)/, async (ctx) => {
  try {
    const method = ctx.match[1];
    const subId = ctx.match[2];
    await ctx.answerCbQuery();

    await supabase.from('subscriptions').update({ paid: true, payMethod: method }).eq('id', subId);
    const { data: sub } = await supabase.from('subscriptions').select('studentId').eq('id', subId).single();
    const { data: student } = await supabase.from('students').select('name').eq('id', sub.studentId).single();

    ctx.reply(`✅ Борг закрито! Оплата за ${student?.name || 'Ученицю'} зафіксована (${method === 'card' ? 'Картка' : 'Готівка'}).`);
  } catch (e) {
    ctx.reply(`🚨 Помилка оплати: ${e.message}`);
  }
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (e) { res.status(500).send('Error'); }
  } else {
    if (req.query.setup === '1') {
      const url = `https://${req.headers.host}/api/bot`;
      await bot.telegram.setWebhook(url);
      res.status(200).send(`Webhook успішно підключено до: ${url} 🚀`);
    } else { res.status(200).send('Бот працює! 🕺'); }
  }
}
