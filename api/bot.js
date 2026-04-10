import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336;

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

// ==========================================
// 1. Команда /start (Список груп)
// ==========================================
async function showGroups(ctx, isEdit = false) {
  const tgId = ctx.from.id;
  let query = supabase.from('groups').select('*');
  if (tgId !== ADMIN_ID) query = query.eq('trainer_tg_id', tgId.toString());
  
  const { data: groups, error } = await query;
  if (error || !groups || groups.length === 0) return ctx.reply('❌ Немає доступу.');

  const buttons = groups.map(g => ({ text: `💃 ${g.name}`, callback_data: `grp_${g.id}` }));
  const rows = chunk(buttons, 2); // Групи залишаємо в 2 колонки

  const text = 'Привіт! 👋\nОбери групу:';
  if (isEdit) {
    ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } }).catch(()=>{});
  } else {
    ctx.reply(text, { reply_markup: { inline_keyboard: rows } });
  }
}

bot.start((ctx) => showGroups(ctx, false));
bot.action('start_menu', async (ctx) => {
  await ctx.answerCbQuery();
  showGroups(ctx, true);
});

// ==========================================
// 2. Генерація списку учениць
// ==========================================
async function renderGroupList(ctx, groupId) {
  const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
  
  // Шукаємо всіх учениць, які мають або мали абонемент у цій групі
  const { data: allSubs } = await supabase.from('subscriptions').select('*').eq('group_id', groupId);
  // На всякий випадок тягнемо з прив'язки групи, якщо ти вже додавав туди
  const { data: stGroups } = await supabase.from('student_groups').select('student_id').eq('group_id', groupId).catch(() => ({ data: [] }));
  
  let studentIds = [];
  if (stGroups && stGroups.length > 0) {
    studentIds = stGroups.map(sg => sg.student_id);
  } else if (allSubs && allSubs.length > 0) {
    studentIds = [...new Set(allSubs.map(s => s.student_id))];
  }

  if (studentIds.length === 0) {
    return ctx.editMessageText('У цій групі поки немає учениць.', { 
        reply_markup: { inline_keyboard: [
            [{ text: '➕ Додати нову', callback_data: `new_st_${groupId}` }],
            [{ text: '🔙 Назад до груп', callback_data: 'start_menu' }]
        ]}
    }).catch(()=>{});
  }

  const { data: students } = await supabase.from('students').select('*').in('id', studentIds);
  
  const buttons = [];
  students.forEach(st => {
    const stSubs = (allSubs || []).filter(s => s.student_id === st.id);
    
    // Шукаємо активний абонемент
    let bestSub = stSubs.find(s => s.end_date >= today && (s.used_trainings || 0) < (s.total_trainings || 1));
    // Якщо активного немає, беремо найсвіжіший старий
    if (!bestSub && stSubs.length > 0) {
        bestSub = stSubs.sort((a,b) => new Date(b.end_date) - new Date(a.end_date))[0];
    }

    let marker = '🔴';
    let subText = '(Немає)';
    let cbData = `nost_${st.id}_${groupId}`; 

    if (bestSub) {
        const isActive = bestSub.end_date >= today && (bestSub.used_trainings || 0) < (bestSub.total_trainings || 1);
        if (isActive) {
            marker = bestSub.paid ? '🟢' : '🔴';
            subText = `(${bestSub.used_trainings || 0}/${bestSub.total_trainings})`;
            cbData = `sub_${bestSub.id}`;
        } else {
            marker = '🔴';
            subText = '(Закінчився)';
            cbData = `sub_${bestSub.id}`; 
        }
    }

    // УЧЕНИЦІ В ОДНУ КОЛОНКУ, ЩОБ ВЛАЗИЛО ІМ'Я!
    buttons.push([{ text: `${marker} ${st.name} ${subText}`, callback_data: cbData }]);
  });

  // Сортуємо за алфавітом для зручності
  buttons.sort((a, b) => a[0].text.localeCompare(b[0].text));

  // Кнопки знизу списку
  buttons.push([{ text: '➕ Додати нову', callback_data: `new_st_${groupId}` }]);
  buttons.push([{ text: '🔙 До списку груп', callback_data: 'start_menu' }]);

  ctx.editMessageText('Оберіть ученицю:', { reply_markup: { inline_keyboard: buttons } }).catch(()=>{});
}

bot.action(/grp_(.+)/, async (ctx) => {
  const groupId = ctx.match[1];
  await ctx.answerCbQuery();
  await renderGroupList(ctx, groupId);
});

// ==========================================
// 3. Меню дій для учениці
// ==========================================
bot.action(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const { data: sub } = await supabase.from('subscriptions').select('group_id, student_id').eq('id', subId).single();
  const { data: student } = await supabase.from('students').select('name').eq('id', sub?.student_id).single();

  ctx.editMessageText(`👩 ${student?.name || 'Учениця'}\nЩо робимо?`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ 1 заняття', callback_data: `mark_1_${subId}` }, { text: '✅✅ 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💳 Внести оплату / Новий абонемент', callback_data: `pay_menu_${subId}` }],
        [{ text: '🔙 Назад до списку', callback_data: `grp_${sub?.group_id}` }]
      ]
    }
  }).catch(() => {});
});

// Для учениць без абонемента (клікаємо з червоним кружком)
bot.action(/nost_(.+)_(.+)/, async (ctx) => {
  const stId = ctx.match[1];
  const grpId = ctx.match[2];
  await ctx.answerCbQuery();
  
  const { data: student } = await supabase.from('students').select('name').eq('id', stId).single();

  ctx.editMessageText(`👩 ${student?.name || 'Учениця'}\nАбонемент відсутній або закінчився.\nСпочатку треба створити новий:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Створити абонемент (Оплата)', callback_data: `newpay_menu_${stId}_${grpId}` }],
        [{ text: '🔙 Назад до списку', callback_data: `grp_${grpId}` }]
      ]
    }
  }).catch(() => {});
});

// ==========================================
// 4. Логіка списання + Автоповернення
// ==========================================
bot.action(/mark_(\d+)_(.+)/, async (ctx) => {
  const count = parseInt(ctx.match[1]);
  const subId = ctx.match[2];

  try {
    const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"})).toISOString().split('T')[0];
    
    if (sub.end_date < today) {
        return ctx.answerCbQuery(`⚠️ Абонемент закінчився! Оформіть новий.`, { show_alert: true });
    }

    const newUsed = (sub.used_trainings || 0) + count;
    if (newUsed > sub.total_trainings) {
      return ctx.answerCbQuery(`⚠️ Недостатньо занять на балансі!`, { show_alert: true });
    }

    await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);
    
    await supabase.from('attendance').insert({ sub_id: subId, group_id: sub.group_id, date: today, quantity: count, entry_type: 'subscription' });

    // Тихе спливаюче вікно
    const left = sub.total_trainings - newUsed;
    await ctx.answerCbQuery(`✅ Списано ${count}. Залишок: ${left}`, { show_alert: false });

    // АВТОМАТИЧНЕ ПОВЕРНЕННЯ ДО СПИСКУ УЧЕНИЦЬ
    await renderGroupList(ctx, sub.group_id);

  } catch (e) {
    ctx.answerCbQuery('❌ Помилка бази даних', { show_alert: true });
  }
});

// ==========================================
// 5. Оновлене меню оплат (існуючий абонемент)
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

// Оновлене меню оплат (для тих, в кого немає абонемента взагалі)
bot.action(/newpay_menu_(.+)_(.+)/, async (ctx) => {
  const stId = ctx.match[1];
  const grpId = ctx.match[2];
  await ctx.answerCbQuery();

  ctx.editMessageText('Оберіть формат:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Разове (300 грн)', callback_data: `createnew_dropin_${stId}_${grpId}` }, { text: 'Пробне (150 грн)', callback_data: `createnew_trial_${stId}_${grpId}` }],
        [{ text: '4 зан.', callback_data: `createnew_4_${stId}_${grpId}` }, { text: '8 зан.', callback_data: `createnew_8_${stId}_${grpId}` }, { text: '12 зан.', callback_data: `createnew_12_${stId}_${grpId}` }],
        [{ text: '🔙 Назад', callback_data: `grp_${grpId}` }]
      ]
    }
  }).catch(() => {});
});

// ==========================================
// 6. Заглушки для розробки
// ==========================================
bot.action(/new_st_(.+)/, async (ctx) => {
   await ctx.answerCbQuery('В розробці: тут бот попросить ввести ім\'я учениці 📝', { show_alert: true });
});

bot.action(/(newpay|createnew)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery('В розробці: тут бот створить новий абонемент і внесе суму 🚀', { show_alert: true });
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
