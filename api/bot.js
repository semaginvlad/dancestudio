import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336;

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

// Спеціальна обгортка, щоб бот НІКОЛИ не зависав мовчки
const safeAction = (actionPattern, handler) => {
    bot.action(actionPattern, async (ctx) => {
        try {
            await handler(ctx);
        } catch (e) {
            console.error(e);
            await ctx.answerCbQuery('❌ Помилка: ' + e.message, { show_alert: true }).catch(()=>null);
        }
    });
}

// ==========================================
// 1. Команда /start
// ==========================================
async function showGroups(ctx, isEdit = false) {
  const tgId = ctx.from.id;
  let query = supabase.from('groups').select('*');
  if (tgId !== ADMIN_ID) query = query.eq('trainer_tg_id', tgId.toString());
  
  const { data: groups, error } = await query;
  if (error || !groups || groups.length === 0) return ctx.reply('❌ Немає доступу.');

  const buttons = groups.map(g => ({ text: `💃 ${g.name}`, callback_data: `grp_${g.id.substring(0, 30)}` }));
  const rows = chunk(buttons, 2);

  const text = 'Привіт! 👋\nОбери групу:';
  if (isEdit) {
    ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } }).catch(()=>{});
  } else {
    ctx.reply(text, { reply_markup: { inline_keyboard: rows } });
  }
}

bot.start(async (ctx) => {
    try { await showGroups(ctx, false); } catch (e) { ctx.reply('Помилка: ' + e.message); }
});

safeAction('start_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await showGroups(ctx, true);
});

// ==========================================
// 2. Список учениць
// ==========================================
async function renderGroupList(ctx, groupId) {
  const dateObj = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"}));
  const formattedToday = dateObj.toISOString().split('T')[0];
  
  // Безпечно тягнемо дані з бази
  const { data: allSubs, error: subsErr } = await supabase.from('subscriptions').select('*').eq('group_id', groupId);
  if (subsErr) throw new Error("Помилка завантаження абонементів");

  const { data: stGroups, error: sgErr } = await supabase.from('student_groups').select('student_id').eq('group_id', groupId);
  if (sgErr) throw new Error("Помилка завантаження списку групи");
  
  let allIds = [];
  if (allSubs) allIds.push(...allSubs.map(s => s.student_id));
  if (stGroups) allIds.push(...stGroups.map(sg => sg.student_id));
  
  let studentIds = [...new Set(allIds)].filter(id => id);

  if (studentIds.length === 0) {
    return ctx.editMessageText('У цій групі поки немає учениць.', { 
        reply_markup: { inline_keyboard: [
            [{ text: '➕ Додати нову', callback_data: `new_st_${groupId.substring(0, 20)}` }],
            [{ text: '🔙 Назад до груп', callback_data: 'start_menu' }]
        ]}
    }).catch(()=>{});
  }

  const { data: students, error: stErr } = await supabase.from('students').select('*').in('id', studentIds);
  if (stErr || !students) throw new Error("Помилка: учениці не знайдені");
  
  const buttons = [];
  students.forEach(st => {
    const stSubs = (allSubs || []).filter(s => s.student_id === st.id);
    
    let bestSub = stSubs.find(s => s.end_date >= formattedToday && (s.used_trainings || 0) < (s.total_trainings || 1));
    if (!bestSub && stSubs.length > 0) {
        bestSub = stSubs.sort((a,b) => new Date(b.end_date) - new Date(a.end_date))[0];
    }

    let marker = '🔴';
    let subText = '(Немає)';
    // Використовуємо короткі ID (щоб не перевищити ліміт Телеграму в 64 символи)
    let cbData = bestSub ? `sub_${bestSub.id}` : `nost_${st.id.substring(0,8)}_${groupId.substring(0, 15)}`; 

    if (bestSub) {
        const isActive = bestSub.end_date >= formattedToday && (bestSub.used_trainings || 0) < (bestSub.total_trainings || 1);
        if (isActive) {
            marker = bestSub.paid ? '🟢' : '🔴';
            subText = `(${bestSub.used_trainings || 0}/${bestSub.total_trainings})`;
        } else {
            marker = '🔴';
            subText = '(Закінчився)';
        }
    }

    // Імена тепер в ОДНУ колонку, щоб влазили ідеально
    buttons.push([{ text: `${marker} ${st.name} ${subText}`, callback_data: cbData }]);
  });

  // Сортуємо алфавітом
  buttons.sort((a, b) => a[0].text.localeCompare(b[0].text));

  buttons.push([{ text: '➕ Додати нову', callback_data: `new_st_${groupId.substring(0, 20)}` }]);
  buttons.push([{ text: '🔙 До списку груп', callback_data: 'start_menu' }]);

  await ctx.editMessageText('Оберіть ученицю:', { reply_markup: { inline_keyboard: buttons } });
}

safeAction(/grp_(.+)/, async (ctx) => {
  const groupId = ctx.match[1];
  await ctx.answerCbQuery();
  await renderGroupList(ctx, groupId);
});

// ==========================================
// 3. Меню дій
// ==========================================
safeAction(/sub_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const { data: sub } = await supabase.from('subscriptions').select('group_id, student_id').eq('id', subId).single();
  if (!sub) throw new Error("Aбонемент не знайдено");

  const { data: student } = await supabase.from('students').select('name').eq('id', sub.student_id).single();

  await ctx.editMessageText(`👩 ${student?.name || 'Учениця'}\nЩо робимо?`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ 1 заняття', callback_data: `mark_1_${subId}` }, { text: '✅✅ 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💳 Внести оплату / Новий', callback_data: `pay_menu_${subId}` }],
        [{ text: '🔙 Назад до списку', callback_data: `grp_${sub.group_id.substring(0, 30)}` }]
      ]
    }
  });
});

safeAction(/nost_(.+)_(.+)/, async (ctx) => {
  const shortId = ctx.match[1];
  const grpId = ctx.match[2];
  await ctx.answerCbQuery();
  
  const { data: student } = await supabase.from('students').select('name, id').ilike('id', `${shortId}%`).single();
  if (!student) throw new Error("Ученицю не знайдено");

  await ctx.editMessageText(`👩 ${student.name}\nАбонемент відсутній або закінчився.\nСпочатку треба створити новий:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Створити абонемент (Оплата)', callback_data: `newpay_menu_${student.id.substring(0,8)}_${grpId}` }],
        [{ text: '🔙 Назад до списку', callback_data: `grp_${grpId}` }]
      ]
    }
  });
});

// ==========================================
// 4. Логіка списання
// ==========================================
safeAction(/mark_(\d+)_(.+)/, async (ctx) => {
  const count = parseInt(ctx.match[1]);
  const subId = ctx.match[2];

  const { data: sub, error: subErr } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
  if (subErr || !sub) throw new Error("Абонемент не знайдено");

  const dateObj = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Kiev"}));
  const formattedToday = dateObj.toISOString().split('T')[0];
  
  if (sub.end_date < formattedToday) {
      return ctx.answerCbQuery(`⚠️ Абонемент закінчився! Оформіть новий.`, { show_alert: true });
  }

  const newUsed = (sub.used_trainings || 0) + count;
  if (newUsed > sub.total_trainings) {
    return ctx.answerCbQuery(`⚠️ Недостатньо занять на балансі!`, { show_alert: true });
  }

  await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);
  await supabase.from('attendance').insert({ sub_id: subId, group_id: sub.group_id, date: formattedToday, quantity: count, entry_type: 'subscription' });

  // Тихе віконце, яке пропадає
  const left = sub.total_trainings - newUsed;
  await ctx.answerCbQuery(`✅ Списано ${count}. Залишок: ${left}`, { show_alert: false });

  // Автоповернення до списку
  await renderGroupList(ctx, sub.group_id);
});

// ==========================================
// 5. Оплати
// ==========================================
safeAction(/pay_menu_(.+)/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  const { data: sub } = await supabase.from('subscriptions').select('group_id').eq('id', subId).single();

  await ctx.editMessageText('Оберіть формат:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Разове (300 грн)', callback_data: `newpay_dropin_${subId}` }, { text: 'Пробне (150 грн)', callback_data: `newpay_trial_${subId}` }],
        [{ text: '4 зан.', callback_data: `newpay_4_${subId}` }, { text: '8 зан.', callback_data: `newpay_8_${subId}` }, { text: '12 зан.', callback_data: `newpay_12_${subId}` }],
        [{ text: '🔙 Назад', callback_data: `sub_${subId}` }]
      ]
    }
  });
});

safeAction(/newpay_menu_(.+)_(.+)/, async (ctx) => {
  const shortId = ctx.match[1];
  const grpId = ctx.match[2];
  await ctx.answerCbQuery();

  await ctx.editMessageText('Оберіть формат:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Разове (300 грн)', callback_data: `cr_dropin_${shortId}_${grpId}` }, { text: 'Пробне (150 грн)', callback_data: `cr_trial_${shortId}_${grpId}` }],
        [{ text: '4 зан.', callback_data: `cr_4_${shortId}_${grpId}` }, { text: '8 зан.', callback_data: `cr_8_${shortId}_${grpId}` }, { text: '12 зан.', callback_data: `cr_12_${shortId}_${grpId}` }],
        [{ text: '🔙 Назад', callback_data: `grp_${grpId}` }]
      ]
    }
  });
});

safeAction(/new_st_(.+)/, async (ctx) => {
   await ctx.answerCbQuery('В розробці: тут бот попросить ввести ім\'я учениці 📝', { show_alert: true });
});

safeAction(/(newpay|cr)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery('В розробці: створення абонемента 🚀', { show_alert: true });
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
