import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_ID = 5681410336;
const stateStore = new Map();

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

const getFormattedDate = (offsetDays = 0) => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const safeAction = (actionPattern, handler) => {
    bot.action(actionPattern, async (ctx) => {
        try {
            await handler(ctx);
        } catch (e) {
            console.error(e);
            await ctx.answerCbQuery('❌ Помилка: ' + e.message, { show_alert: true }).catch(() => null);
        }
    });
};

// ==========================================
// 1. Команда /start та Групи
// ==========================================
async function showGroups(ctx, isEdit = false) {
    const tgId = ctx.from.id;
    let query = supabase.from('groups').select('*');
    if (tgId !== ADMIN_ID) query = query.eq('trainer_tg_id', tgId.toString());

    const { data: groups, error } = await query;
    if (error || !groups || groups.length === 0) return ctx.reply('❌ Немає доступу або груп.');

    const buttons = groups.map(g => ({ text: `💃 ${g.name}`, callback_data: `grp_${g.id.substring(0, 8)}` }));
    const rows = chunk(buttons, 2);

    const text = 'Привіт! 👋\nОбери групу:';
    if (isEdit) ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } }).catch(() => { });
    else ctx.reply(text, { reply_markup: { inline_keyboard: rows } });
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
async function renderGroupList(ctx, shortGrpId) {
    const formattedToday = getFormattedDate(0);

    const { data: allGroups } = await supabase.from('groups').select('id');
    const group = allGroups?.find(g => g.id.startsWith(shortGrpId));
    if (!group) throw new Error("Групу не знайдено");
    const groupId = group.id;

    const { data: allSubs, error: subsErr } = await supabase.from('subscriptions').select('*').eq('group_id', groupId);
    if (subsErr) throw new Error("Помилка завантаження абонементів");

    const { data: stGroups, error: sgErr } = await supabase.from('student_groups').select('student_id').eq('group_id', groupId);
    if (sgErr) throw new Error("Помилка завантаження списку");

    let allIds = [];
    if (allSubs) allIds.push(...allSubs.map(s => s.student_id));
    if (stGroups) allIds.push(...stGroups.map(sg => sg.student_id));

    let studentIds = [...new Set(allIds)].filter(id => id);

    if (studentIds.length === 0) {
        return ctx.editMessageText('У цій групі поки немає учениць.', {
            reply_markup: { inline_keyboard: [[{ text: '➕ Додати нову', callback_data: `new_st_${shortGrpId}` }], [{ text: '🔙 Назад', callback_data: 'start_menu' }]] }
        }).catch(() => { });
    }

    const { data: students, error: stErr } = await supabase.from('students').select('*').in('id', studentIds);
    if (stErr || !students) throw new Error("Учениці не знайдені");

    const buttons = [];
    students.forEach(st => {
        const stSubs = (allSubs || []).filter(s => s.student_id === st.id);
        let bestSub = stSubs.find(s => s.end_date >= formattedToday && (s.used_trainings || 0) < (s.total_trainings || 1));
        if (!bestSub && stSubs.length > 0) bestSub = stSubs.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];

        let marker = '🔴';
        let subText = '(Немає)';
        let cbData = bestSub ? `sub_${bestSub.id}` : `nost_${st.id.substring(0, 8)}_${shortGrpId}`;

        if (bestSub) {
            const isActive = bestSub.end_date >= formattedToday && (bestSub.used_trainings || 0) < (bestSub.total_trainings || 1);
            if (isActive) {
                const daysLeft = (new Date(bestSub.end_date) - new Date(formattedToday)) / (1000 * 60 * 60 * 24);
                const isExpiring = (bestSub.total_trainings - (bestSub.used_trainings || 0) <= 1) || (daysLeft <= 2);

                if (!bestSub.paid) marker = '💸'; 
                else if (isExpiring) marker = '🟡'; 
                else marker = '🟢'; 

                subText = `(${bestSub.used_trainings || 0}/${bestSub.total_trainings})`;
            } else {
                marker = !bestSub.paid ? '💸' : '🔴';
                subText = '(Закінчився)';
            }
        }
        buttons.push([{ text: `${marker} ${st.name} ${subText}`, callback_data: cbData }]);
    });

    buttons.sort((a, b) => a[0].text.localeCompare(b[0].text));

    buttons.push([{ text: '➕ Додати нову', callback_data: `new_st_${shortGrpId}` }]);
    buttons.push([{ text: '💸 Боржники', callback_data: `debt_${shortGrpId}` }, { text: '📊 Статистика', callback_data: `stat_${shortGrpId}` }]);
    buttons.push([{ text: '🔙 До списку груп', callback_data: 'start_menu' }]);

    await ctx.editMessageText('Оберіть ученицю:\n🟢 - Ок | 🟡 - Мало занять | 💸 - Борг | 🔴 - Немає', { reply_markup: { inline_keyboard: buttons } });
}

safeAction(/grp_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderGroupList(ctx, ctx.match[1]);
});

// ==========================================
// 3. Меню учениці та Відмітки
// ==========================================
safeAction(/sub_(.+)/, async (ctx) => {
    const subId = ctx.match[1];
    await ctx.answerCbQuery();

    const { data: sub } = await supabase.from('subscriptions').select('*, students(name)').eq('id', subId).single();
    if (!sub) throw new Error("Aбонемент не знайдено");

    const stShort = sub.student_id.substring(0, 8);
    const grpShort = sub.group_id.substring(0, 8);

    const buttons = [
        [{ text: '✅ 1 заняття', callback_data: `mark_1_${subId}` }, { text: '✅✅ 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💳 Створити новий', callback_data: `newpay_menu_${stShort}_${grpShort}` }]
    ];

    if (!sub.paid) {
        // Використовуємо amount замість price
        buttons.splice(1, 0, [{ text: `💰 Внести оплату (${sub.amount} грн)`, callback_data: `markpaid_${subId}` }]);
    }
    
    buttons.push([{ text: '🔙 Назад до списку', callback_data: `grp_${grpShort}` }]);

    await ctx.editMessageText(`👩 ${sub.students?.name || 'Учениця'}\nБаланс: ${sub.used_trainings || 0} з ${sub.total_trainings}\nДіє до: ${sub.end_date}\nСтатус: ${sub.paid ? '🟢 Оплачено' : '🔴 НЕ ОПЛАЧЕНО'}\n\nЩо робимо?`, {
        reply_markup: { inline_keyboard: buttons }
    });
});

safeAction(/nost_(.+)_(.+)/, async (ctx) => {
    const shortId = ctx.match[1];
    const grpShort = ctx.match[2];
    await ctx.answerCbQuery();

    const { data: allStudents } = await supabase.from('students').select('name, id');
    const student = allStudents?.find(s => s.id.startsWith(shortId));
    if (!student) throw new Error("Ученицю не знайдено");

    await ctx.editMessageText(`👩 ${student.name}\nАбонемент відсутній або закінчився.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💳 Створити новий', callback_data: `newpay_menu_${shortId}_${grpShort}` }],
                [{ text: '🔙 Назад до списку', callback_data: `grp_${grpShort}` }]
            ]
        }
    });
});

// ==========================================
// 4. ВІЗАРД СТВОРЕННЯ АБОНЕМЕНТА (КРОК 1-4)
// ==========================================

// Крок 1: Вибір формату
safeAction(/newpay_menu_(.+)_(.+)/, async (ctx) => {
    const stShort = ctx.match[1];
    const grpShort = ctx.match[2];
    await ctx.answerCbQuery();

    await ctx.editMessageText('Оберіть формат абонемента:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Разове (300)', callback_data: `wz_cnt_1_${stShort}_${grpShort}` }, { text: 'Пробне (150)', callback_data: `wz_cnt_0_${stShort}_${grpShort}` }],
                [{ text: '4 зан. (1000)', callback_data: `wz_cnt_4_${stShort}_${grpShort}` }, { text: '8 зан. (1500)', callback_data: `wz_cnt_8_${stShort}_${grpShort}` }],
                [{ text: '12 зан. (1800)', callback_data: `wz_cnt_12_${stShort}_${grpShort}` }],
                [{ text: '🔙 Скасувати', callback_data: `grp_${grpShort}` }]
            ]
        }
    });
});

// Крок 2: Вибір дати початку
safeAction(/wz_cnt_(\d+)_(.+)_(.+)/, async (ctx) => {
    const count = ctx.match[1];
    const stShort = ctx.match[2];
    const grpShort = ctx.match[3];
    await ctx.answerCbQuery();

    await ctx.editMessageText('📅 З якої дати починає діяти абонемент?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: `Сьогодні (${getFormattedDate(0).substring(5)})`, callback_data: `wz_dt_0_${count}_${stShort}_${grpShort}` }],
                [{ text: `Завтра (${getFormattedDate(1).substring(5)})`, callback_data: `wz_dt_1_${count}_${stShort}_${grpShort}` }],
                [{ text: '🔙 Скасувати', callback_data: `grp_${grpShort}` }]
            ]
        }
    });
});

// Крок 3: Вибір форми оплати
safeAction(/wz_dt_(\d+)_(.+)_(.+)_(.+)/, async (ctx) => {
    const dtOffset = ctx.match[1];
    const count = ctx.match[2];
    const stShort = ctx.match[3];
    const grpShort = ctx.match[4];
    await ctx.answerCbQuery();

    await ctx.editMessageText('💵 Як оплачуємо?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💵 Готівка', callback_data: `wz_pay_cash_${dtOffset}_${count}_${stShort}_${grpShort}` }, { text: '💳 Картка', callback_data: `wz_pay_card_${dtOffset}_${count}_${stShort}_${grpShort}` }],
                [{ text: '⏳ Поки НЕ оплачено (Борг)', callback_data: `wz_pay_none_${dtOffset}_${count}_${stShort}_${grpShort}` }],
                [{ text: '🔙 Скасувати', callback_data: `grp_${grpShort}` }]
            ]
        }
    });
});

// Крок 4: Фінальне створення в БД
safeAction(/wz_pay_(cash|card|none)_(\d+)_(.+)_(.+)_(.+)/, async (ctx) => {
    const payMethodStr = ctx.match[1]; 
    const dtOffset = parseInt(ctx.match[2]);
    const count = parseInt(ctx.match[3]);
    const stShort = ctx.match[4];
    const grpShort = ctx.match[5];

    const { data: allStudents } = await supabase.from('students').select('id');
    const student = allStudents?.find(s => s.id.startsWith(stShort));
    if (!student) throw new Error("Ученицю не знайдено");

    const { data: allGroups } = await supabase.from('groups').select('id');
    const group = allGroups?.find(g => g.id.startsWith(grpShort));
    if (!group) throw new Error("Групу не знайдено");

    const startDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
    startDate.setDate(startDate.getDate() + dtOffset);
    const endDate = new Date(startDate);
    
    let price = 0; let totalTrainings = count;
    if (count === 0) { price = 150; totalTrainings = 1; endDate.setDate(startDate.getDate() + 7); }
    else if (count === 1) { price = 300; endDate.setDate(startDate.getDate() + 7); }
    else if (count === 4) { price = 1000; endDate.setDate(startDate.getDate() + 30); }
    else if (count === 8) { price = 1500; endDate.setDate(startDate.getDate() + 30); }
    else if (count === 12) { price = 1800; endDate.setDate(startDate.getDate() + 30); }
    else { price = 0; endDate.setDate(startDate.getDate() + 30); }

    const formattedStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const formattedEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    let pay_method = null;
    let paid = false;
    
    if (payMethodStr === 'cash') { pay_method = 'cash'; paid = true; }
    if (payMethodStr === 'card') { pay_method = 'card'; paid = true; }

    // ЗМІНЕНО: Записуємо суму в amount та base_price
    const { error } = await supabase.from('subscriptions').insert({
        student_id: student.id,
        group_id: group.id,
        total_trainings: totalTrainings,
        used_trainings: 0,
        start_date: formattedStart,
        end_date: formattedEnd,
        amount: price,
        base_price: price,
        paid: paid,
        pay_method: pay_method 
    });

    if (error) throw new Error(`Помилка БД: ${error.message}`);

    await ctx.answerCbQuery('✅ Абонемент успішно створено!');
    await renderGroupList(ctx, grpShort);
});

// ==========================================
// 5. Оплата існуючого боргу
// ==========================================
safeAction(/markpaid_(.+)/, async (ctx) => {
    const subId = ctx.match[1];
    await ctx.answerCbQuery();
    
    await ctx.editMessageText('💵 Оберіть форму оплати боргу:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💵 Готівка', callback_data: `payok_cash_${subId}` }, { text: '💳 На картку', callback_data: `payok_card_${subId}` }],
                [{ text: '🔙 Назад', callback_data: `sub_${subId}` }]
            ]
        }
    });
});

safeAction(/payok_(cash|card)_(.+)/, async (ctx) => {
    const payMethodCode = ctx.match[1]; // 'cash' або 'card'
    const displayMethod = payMethodCode === 'cash' ? 'Готівка' : 'Картка';
    const subId = ctx.match[2];

    const { data: sub } = await supabase.from('subscriptions').select('group_id').eq('id', subId).single();
    if (!sub) throw new Error("Абонемент не знайдено");

    const { error } = await supabase.from('subscriptions').update({ 
        paid: true,
        pay_method: payMethodCode 
    }).eq('id', subId);

    if (error) throw new Error(`Помилка БД: ${error.message}`);

    await ctx.answerCbQuery(`✅ Оплачено (${displayMethod})!`);
    await renderGroupList(ctx, sub.group_id.substring(0, 8));
});

// ==========================================
// 6. Відмітки, Додавання, Боржники 
// ==========================================
safeAction(/mark_(\d+)_(.+)/, async (ctx) => {
    const count = parseInt(ctx.match[1]);
    const subId = ctx.match[2];

    const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    if (!sub) throw new Error("Абонемент не знайдено");

    const formattedToday = getFormattedDate(0);
    if (sub.end_date < formattedToday) return ctx.answerCbQuery(`⚠️ Абонемент закінчився!`, { show_alert: true });

    const newUsed = (sub.used_trainings || 0) + count;
    if (newUsed > sub.total_trainings) return ctx.answerCbQuery(`⚠️ Недостатньо занять на балансі!`, { show_alert: true });

    const { error: updErr } = await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);
    if(updErr) throw new Error(updErr.message);
    
    const { data: attRec } = await supabase.from('attendance')
        .insert({ sub_id: subId, group_id: sub.group_id, date: formattedToday, quantity: count, entry_type: 'subscription' })
        .select('id').single();

    const left = sub.total_trainings - newUsed;
    await ctx.answerCbQuery(`✅ Списано ${count}. Залишок: ${left}`);

    await ctx.editMessageText(`✅ Успішно відмічено ${count} заняття.\nЗалишок: ${left}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '↩️ Відмінити (Випадково)', callback_data: `undo_${attRec.id}` }],
                [{ text: '🔙 До списку групи', callback_data: `grp_${sub.group_id.substring(0,8)}` }]
            ]
        }
    });
});

safeAction(/undo_(.+)/, async (ctx) => {
    const attId = ctx.match[1];
    const { data: att } = await supabase.from('attendance').select('*').eq('id', attId).single();
    if (!att) return ctx.answerCbQuery('❌ Відмітку вже скасовано', { show_alert: true });

    const { data: sub } = await supabase.from('subscriptions').select('used_trainings').eq('id', att.sub_id).single();
    if (sub) {
        await supabase.from('subscriptions').update({ used_trainings: Math.max(0, sub.used_trainings - att.quantity) }).eq('id', att.sub_id);
    }

    await supabase.from('attendance').delete().eq('id', attId);
    await ctx.answerCbQuery('↩️ Скасовано!');
    await renderGroupList(ctx, att.group_id.substring(0,8));
});

safeAction(/new_st_(.+)/, async (ctx) => {
    const shortGrpId = ctx.match[1];
    const { data: allGroups } = await supabase.from('groups').select('id');
    const group = allGroups?.find(g => g.id.startsWith(shortGrpId));
    
    stateStore.set(ctx.from.id, { step: 'waiting_name', groupId: group.id });
    await ctx.answerCbQuery();
    await ctx.reply('📝 Напиши Прізвище та Ім\'я учениці просто сюди в чат:');
});

bot.on('text', async (ctx) => {
    const state = stateStore.get(ctx.from.id);
    if (state && state.step === 'waiting_name') {
        const name = ctx.message.text;
        const groupId = state.groupId;
        stateStore.delete(ctx.from.id);

        try {
            const { data: st, error: stErr } = await supabase.from('students').insert({ name }).select().single();
            if (stErr) throw stErr;
            await supabase.from('student_groups').insert({ student_id: st.id, group_id: groupId });

            await ctx.reply(`✅ Ученицю "${name}" додано!`);
            await showGroups(ctx, false);
        } catch (e) {
            await ctx.reply("❌ Помилка: " + e.message);
        }
    }
});

safeAction(/debt_(.+)/, async (ctx) => {
    const shortGrpId = ctx.match[1];
    await ctx.answerCbQuery();

    const { data: allGroups } = await supabase.from('groups').select('id');
    const group = allGroups?.find(g => g.id.startsWith(shortGrpId));

    // Використовуємо amount замість price
    const { data: subs } = await supabase.from('subscriptions').select('*, students(name)').eq('group_id', group.id).eq('paid', false);

    if (!subs || subs.length === 0) {
        return ctx.editMessageText('🎉 Боржників немає!', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${shortGrpId}` }]] }
        });
    }

    const text = '💸 **Боржники:**\n\n' + subs.map(s => `- ${s.students?.name || 'Невідомо'} (${s.amount} грн)`).join('\n');
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${shortGrpId}` }]] } });
});

safeAction(/stat_(.+)/, async (ctx) => {
    const shortGrpId = ctx.match[1];
    const today = getFormattedDate(0);
    await ctx.answerCbQuery();

    const { data: allGroups } = await supabase.from('groups').select('id');
    const group = allGroups?.find(g => g.id.startsWith(shortGrpId));

    const { data: att } = await supabase.from('attendance').select('quantity').eq('group_id', group.id).eq('date', today);
    const totalVisits = att ? att.reduce((sum, record) => sum + record.quantity, 0) : 0;

    // Читаємо amount замість price
    const { data: newSubs } = await supabase.from('subscriptions').select('amount').eq('group_id', group.id).gte('created_at', today + 'T00:00:00Z');
    const totalMoney = newSubs ? newSubs.reduce((sum, sub) => sum + (sub.amount || 0), 0) : 0;

    await ctx.editMessageText(`📊 **Статистика за сьогодні (${today}):**\n\nВідмічено занять: **${totalVisits}**\nНових абонементів на суму: **${totalMoney} грн**`, {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${shortGrpId}` }]] }
    });
});

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } 
        catch (e) { res.status(500).send('Error'); }
    } else { res.status(200).send('Бот працює! 🕺'); }
}
