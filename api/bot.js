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

const getToday = () => {
    const dateObj = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
    return dateObj.toISOString().split('T')[0];
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

    const buttons = groups.map(g => ({ text: `💃 ${g.name}`, callback_data: `grp_${g.id.substring(0, 30)}` }));
    const rows = chunk(buttons, 2);

    const text = 'Привіт! 👋\nОбери групу:';
    if (isEdit) {
        ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } }).catch(() => { });
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
    const formattedToday = getToday();

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
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Додати нову', callback_data: `new_st_${groupId.substring(0, 20)}` }],
                    [{ text: '🔙 Назад до груп', callback_data: 'start_menu' }]
                ]
            }
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
        let cbData = bestSub ? `sub_${bestSub.id}` : `nost_${st.id.substring(0, 8)}_${groupId.substring(0, 15)}`;

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

    buttons.push([{ text: '➕ Додати нову', callback_data: `new_st_${groupId.substring(0, 20)}` }]);
    buttons.push([
        { text: '💸 Боржники', callback_data: `debt_${groupId.substring(0, 20)}` },
        { text: '📊 Статистика', callback_data: `stat_${groupId.substring(0, 20)}` }
    ]);
    buttons.push([{ text: '🔙 До списку груп', callback_data: 'start_menu' }]);

    await ctx.editMessageText('Оберіть ученицю:\n🟢 - Ок | 🟡 - Залишилось мало | 💸 - Борг | 🔴 - Немає/Закінчився', {
        reply_markup: { inline_keyboard: buttons }
    });
}

safeAction(/grp_(.+)/, async (ctx) => {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery();
    await renderGroupList(ctx, groupId);
});

// ==========================================
// 3. Додавання нової учениці
// ==========================================
safeAction(/new_st_(.+)/, async (ctx) => {
    const groupId = ctx.match[1];
    stateStore.set(ctx.from.id, { step: 'waiting_name', groupId });
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

// ==========================================
// 4. Боржники та Статистика
// ==========================================
safeAction(/debt_(.+)/, async (ctx) => {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery();

    const { data: subs } = await supabase.from('subscriptions')
        .select('*, students(name)')
        .eq('group_id', groupId)
        .eq('paid', false);

    if (!subs || subs.length === 0) {
        return ctx.editMessageText('🎉 Боржників немає!', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${groupId}` }]] }
        });
    }

    const text = '💸 **Боржники:**\n\n' + subs.map(s => `- ${s.students?.name || 'Невідомо'} (${s.price} грн)`).join('\n');
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${groupId}` }]] }
    });
});

safeAction(/stat_(.+)/, async (ctx) => {
    const groupId = ctx.match[1];
    const today = getToday();
    await ctx.answerCbQuery();

    const { data: att } = await supabase.from('attendance').select('quantity').eq('group_id', groupId).eq('date', today);
    const totalVisits = att ? att.reduce((sum, record) => sum + record.quantity, 0) : 0;

    const { data: newSubs } = await supabase.from('subscriptions').select('price').eq('group_id', groupId).gte('created_at', today + 'T00:00:00Z');
    const totalMoney = newSubs ? newSubs.reduce((sum, sub) => sum + (sub.price || 0), 0) : 0;

    await ctx.editMessageText(`📊 **Статистика за сьогодні (${today}):**\n\nВідмічено занять: **${totalVisits}**\nНових абонементів на суму: **${totalMoney} грн**`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `grp_${groupId}` }]] }
    });
});

// ==========================================
// 5. Меню учениці та Відмітки
// ==========================================
safeAction(/sub_(.+)/, async (ctx) => {
    const subId = ctx.match[1];
    await ctx.answerCbQuery();

    const { data: sub } = await supabase.from('subscriptions').select('*, students(name)').eq('id', subId).single();
    if (!sub) throw new Error("Aбонемент не знайдено");

    const buttons = [
        [{ text: '✅ 1 заняття', callback_data: `mark_1_${subId}` }, { text: '✅✅ 2 заняття', callback_data: `mark_2_${subId}` }],
        [{ text: '💳 Створити новий', callback_data: `pay_menu_${subId}` }]
    ];

    if (!sub.paid) {
        buttons.splice(1, 0, [{ text: `💰 Внести оплату (${sub.price} грн)`, callback_data: `markpaid_${subId}` }]);
    }
    
    buttons.push([{ text: '🔙 Назад до списку', callback_data: `grp_${sub.group_id.substring(0, 30)}` }]);

    await ctx.editMessageText(`👩 ${sub.students?.name || 'Учениця'}\nБаланс: ${sub.used_trainings || 0} з ${sub.total_trainings}\nДіє до: ${sub.end_date}\nСтатус: ${sub.paid ? '🟢 Оплачено' : '🔴 НЕ ОПЛАЧЕНО'}\n\nЩо робимо?`, {
        reply_markup: { inline_keyboard: buttons }
    });
});

safeAction(/nost_(.+)_(.+)/, async (ctx) => {
    const shortId = ctx.match[1];
    const grpId = ctx.match[2];
    await ctx.answerCbQuery();

    const { data: student } = await supabase.from('students').select('name, id').ilike('id', `${shortId}%`).single();
    if (!student) throw new Error("Ученицю не знайдено");

    await ctx.editMessageText(`👩 ${student.name}\nАбонемент відсутній або закінчився.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💳 Створити новий', callback_data: `newpay_menu_${student.id.substring(0, 8)}_${grpId}` }],
                [{ text: '🔙 Назад до списку', callback_data: `grp_${grpId}` }]
            ]
        }
    });
});

// ==========================================
// 6. Логіка списання та Скасування
// ==========================================
safeAction(/mark_(\d+)_(.+)/, async (ctx) => {
    const count = parseInt(ctx.match[1]);
    const subId = ctx.match[2];

    const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
    if (!sub) throw new Error("Абонемент не знайдено");

    const formattedToday = getToday();
    if (sub.end_date < formattedToday) return ctx.answerCbQuery(`⚠️ Абонемент закінчився!`, { show_alert: true });

    const newUsed = (sub.used_trainings || 0) + count;
    if (newUsed > sub.total_trainings) return ctx.answerCbQuery(`⚠️ Недостатньо занять на балансі!`, { show_alert: true });

    await supabase.from('subscriptions').update({ used_trainings: newUsed }).eq('id', subId);
    
    const { data: attRec } = await supabase.from('attendance')
        .insert({ sub_id: subId, group_id: sub.group_id, date: formattedToday, quantity: count, entry_type: 'subscription' })
        .select('id').single();

    const left = sub.total_trainings - newUsed;
    await ctx.answerCbQuery(`✅ Списано ${count}. Залишок: ${left}`);

    await ctx.editMessageText(`✅ Успішно відмічено ${count} заняття.\nЗалишок: ${left}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '↩️ Відмінити (Випадково)', callback_data: `undo_${attRec.id}` }],
                [{ text: '🔙 До списку групи', callback_data: `grp_${sub.group_id}` }]
            ]
        }
    });
});

safeAction(/undo_(.+)/, async (ctx) => {
    const attId = ctx.match[1];
    const { data: att } = await supabase.from('attendance').select('*').eq('id', attId).single();
    if (!att) return ctx.answerCbQuery('❌ Відмітку вже скасовано або не знайдено', { show_alert: true });

    const { data: sub } = await supabase.from('subscriptions').select('used_trainings').eq('id', att.sub_id).single();
    if (sub) {
        await supabase.from('subscriptions').update({ used_trainings: Math.max(0, sub.used_trainings - att.quantity) }).eq('id', att.sub_id);
    }

    await supabase.from('attendance').delete().eq('id', attId);
    await ctx.answerCbQuery('↩️ Відмітку скасовано!');
    await renderGroupList(ctx, att.group_id);
});

// ==========================================
// 7. Створення абонементів та Оплати (ОНОВЛЕНО)
// ==========================================

// КРОК 1: Запит форми оплати
safeAction(/markpaid_(.+)/, async (ctx) => {
    const subId = ctx.match[1];
    await ctx.answerCbQuery();
    
    await ctx.editMessageText('💵 Оберіть форму оплати:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💵 Готівка', callback_data: `payok_cash_${subId}` }, { text: '💳 На картку', callback_data: `payok_card_${subId}` }],
                [{ text: '🔙 Назад', callback_data: `sub_${subId}` }]
            ]
        }
    });
});

// КРОК 2: Підтвердження оплати
safeAction(/payok_(cash|card)_(.+)/, async (ctx) => {
    const methodStr = ctx.match[1] === 'cash' ? 'Готівка' : 'На картку';
    const subId = ctx.match[2];

    const { data: sub } = await supabase.from('subscriptions').select('*, students(name)').eq('id', subId).single();
    if (!sub) return ctx.answerCbQuery('❌ Помилка', { show_alert: true });

    // Оновлюємо статус на "Оплачено"
    await supabase.from('subscriptions').update({ paid: true }).eq('id', subId);

    await ctx.answerCbQuery('✅ Оплата пройшла!');

    // Показуємо красивий чек з усією інфою
    await ctx.editMessageText(
        `✅ **Оплату успішно внесено!**\n\n👩 Учениця: ${sub.students?.name || 'Невідомо'}\n💰 Сума: ${sub.price} грн\n💳 Форма оплати: ${methodStr}\n📅 Дата початку: ${sub.start_date}\n⏳ Діє до: ${sub.end_date}`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Меню учениці', callback_data: `sub_${subId}` }],
                    [{ text: '🔙 До списку групи', callback_data: `grp_${sub.group_id}` }]
                ]
            }
        }
    );
});

safeAction(/pay_menu_(.+)/, async (ctx) => {
    const subId = ctx.match[1];
    await ctx.answerCbQuery();
    const { data: sub } = await supabase.from('subscriptions').select('group_id, student_id').eq('id', subId).single();

    await ctx.editMessageText('Оберіть формат нового абонемента:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Разове (300)', callback_data: `cr_1_${sub.student_id.substring(0, 8)}_${sub.group_id}` }, { text: 'Пробне (150)', callback_data: `cr_0_${sub.student_id.substring(0, 8)}_${sub.group_id}` }],
                [{ text: '4 зан. (1000)', callback_data: `cr_4_${sub.student_id.substring(0, 8)}_${sub.group_id}` }, { text: '8 зан. (1500)', callback_data: `cr_8_${sub.student_id.substring(0, 8)}_${sub.group_id}` }],
                [{ text: '12 зан. (1800)', callback_data: `cr_12_${sub.student_id.substring(0, 8)}_${sub.group_id}` }],
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
                [{ text: 'Разове (300)', callback_data: `cr_1_${shortId}_${grpId}` }, { text: 'Пробне (150)', callback_data: `cr_0_${shortId}_${grpId}` }],
                [{ text: '4 зан. (1000)', callback_data: `cr_4_${shortId}_${grpId}` }, { text: '8 зан. (1500)', callback_data: `cr_8_${shortId}_${grpId}` }],
                [{ text: '12 зан. (1800)', callback_data: `cr_12_${shortId}_${grpId}` }],
                [{ text: '🔙 Назад', callback_data: `grp_${grpId}` }]
            ]
        }
    });
});

safeAction(/cr_(\d+)_(.+)_(.+)/, async (ctx) => {
    const count = parseInt(ctx.match[1]);
    const shortStId = ctx.match[2];
    const grpId = ctx.match[3];

    const { data: student } = await supabase.from('students').select('id').ilike('id', `${shortStId}%`).single();
    if (!student) return ctx.answerCbQuery('Помилка: ученицю не знайдено');

    const startDate = new Date();
    const endDate = new Date();
    
    let price = 0;
    let totalTrainings = count;

    if (count === 0) { price = 150; totalTrainings = 1; endDate.setDate(startDate.getDate() + 7); }
    else if (count === 1) { price = 300; endDate.setDate(startDate.getDate() + 7); }
    else if (count === 4) { price = 1000; endDate.setDate(startDate.getDate() + 30); }
    else if (count === 8) { price = 1500; endDate.setDate(startDate.getDate() + 30); }
    else if (count === 12) { price = 1800; endDate.setDate(startDate.getDate() + 30); }
    else { price = 0; endDate.setDate(startDate.getDate() + 30); }

    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];

    await supabase.from('subscriptions').insert({
        student_id: student.id,
        group_id: grpId,
        total_trainings: totalTrainings,
        used_trainings: 0,
        start_date: formattedStart,
        end_date: formattedEnd,
        price: price,
        paid: false
    });

    await ctx.answerCbQuery('✅ Абонемент створено! (Не оплачений)');
    await renderGroupList(ctx, grpId);
});

// ==========================================
// Webhook Handler
// ==========================================
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
