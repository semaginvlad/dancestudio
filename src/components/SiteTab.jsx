import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../db';
import { Badge, Pill } from './UI';
import { btnP, btnS, cardSt, inputSt, theme } from '../shared/constants';
import { normalizeSiteTrainerContent, SITE_TRAINER_CONTENT_FIELDS } from '../shared/siteTrainerContent';
import {
  HOME_SECTION_DEFAULT_ENABLED, HOME_SECTION_FIELDS, HOME_SECTION_LABELS, HOME_SECTION_ORDER,
  SITE_CTA_PAGE_KEYS, SITE_DIRECTION_CONTENT_FIELDS, SITE_PAGE_CONTENT_FIELDS, validateSiteLogo,
} from '../shared/sitePageContent';
import { formatGroupScheduleLabel } from '../shared/groupLabels';
import { formatGroupStartDate, getPublicGroupBlockers, isArchivedSiteGroup } from '../shared/siteGroups';

const CONTENT_GROUPS = [
  ['Основне', [['publicName', 'Публічне ім’я'], ['roleLabel', 'Роль'], ['mainDirectionName', 'Назва основного напряму'], ['heroLabel', 'Великий напис на портреті']]],
  ['Підписи та описи', [['profileEyebrow', 'Верхній підпис профілю'], ['mainDirectionEyebrow', 'Підпис основного напряму'], ['mainDirectionDetailEyebrow', 'Додатковий підпис'], ['profileSummary', 'Короткий опис профілю'], ['videoSummary', 'Текст під відео'], ['emptyPortraitSummary', 'Текст placeholder-портрета']]],
  ['Кнопки', [['primaryCtaLabel', 'Текст основної кнопки'], ['secondaryCtaLabel', 'Текст другої кнопки']]],
];

const PAGE_LABELS = {
  home: 'Головна',
  schedule: 'Розклад',
  directions: 'Напрямки',
  coaches: 'Тренери',
  about: 'Про студію',
  join: 'Приєднатися',
  directions_quiz: 'Квіз напрямків',
};

const TEXT_LABELS = {
  eyebrow: 'Верхній маленький підпис', title: 'Головний заголовок', subtitle: 'Підзаголовок', description: 'Опис',
  primaryCtaLabel: 'Текст основної CTA-кнопки', secondaryCtaLabel: 'Текст другої CTA-кнопки',
  city: 'Місто', studioLabel: 'Підпис студії', cityStudioLabel: 'Спільний напис «Місто / Dance Studio»',
  baseTitle: 'Назва BASE', baseLabel: 'Підпис BASE', baseDescription: 'Опис BASE',
  mixTitle: 'Назва MIX', mixLabel: 'Підпис MIX', mixDescription: 'Опис MIX',
  loadErrorMessage: 'Повідомлення при помилці завантаження', emptyScheduleMessage: 'Повідомлення, коли занять немає',
};

const SECTION_FIELD_LABELS = {
  eyebrow: 'Верхній маленький підпис', title: 'Заголовок', description: 'Опис',
  primary_cta_label: 'Текст основної CTA-кнопки', primary_cta_page_key: 'Сторінка основної CTA-кнопки',
  secondary_cta_label: 'Текст другої CTA-кнопки', secondary_cta_page_key: 'Сторінка другої CTA-кнопки',
  featured_limit: 'Кількість напрямків',
};

const Toggle = ({ checked, disabled, onChange, children }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: disabled ? theme.textLight : theme.textMain, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    {children}
  </label>
);

const OrderButtons = ({ index, total, disabled, onMove }) => (
  <div style={{ display: 'inline-flex', gap: 6 }}>
    <button type="button" aria-label="Перемістити вгору" style={{ ...btnS, padding: '7px 11px' }} disabled={disabled || index === 0} onClick={() => onMove(-1)}>↑</button>
    <button type="button" aria-label="Перемістити вниз" style={{ ...btnS, padding: '7px 11px' }} disabled={disabled || index === total - 1} onClick={() => onMove(1)}>↓</button>
  </div>
);

const Row = ({ title, subtitle, status, actions }) => (
  <div style={{ ...cardSt, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
    <div style={{ minWidth: 180, flex: '1 1 240px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>{title}</strong>{status}
      </div>
      {subtitle && <div style={{ marginTop: 4, color: theme.textMuted, fontSize: 12 }}>{subtitle}</div>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{actions}</div>
  </div>
);

const TrainerContentEditor = ({ trainer, onClose, onSaved }) => {
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(SITE_TRAINER_CONTENT_FIELDS.map((key) => [key, trainer.content?.[key] || ''])), profileSections: trainer.content?.profileSections || [] }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeSection = (index, patch) => setField('profileSections', form.profileSections.map((item, i) => i === index ? { ...item, ...patch } : item));
  const moveSection = (index, delta) => { const next = [...form.profileSections]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setField('profileSections', next); };
  const save = async () => {
    setSaving(true); setError('');
    try { await db.updateSiteTrainerProfileContent(trainer.trainerId, normalizeSiteTrainerContent(form)); await onSaved(); onClose(); }
    catch (nextError) { setError(nextError?.message || 'Не вдалося зберегти профіль.'); }
    finally { setSaving(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label={`Профіль ${trainer.name}`} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,25,45,.55)', padding: 16, overflowY: 'auto' }}>
    <div style={{ ...cardSt, maxWidth: 820, margin: '24px auto', display: 'grid', gap: 18 }}>
      <div><h3 style={{ margin: 0 }}>Профіль: {trainer.name}</h3><p style={{ color: theme.textMuted, marginBottom: 0 }}>Порожнє поле = сайт тимчасово використає поточний текст із коду.</p></div>
      {CONTENT_GROUPS.map(([heading, fields]) => <section key={heading}><h4>{heading}</h4><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {fields.map(([key, label]) => <label key={key} style={{ fontSize: 13, fontWeight: 600 }}>{label}<textarea rows={key.toLowerCase().includes('summary') ? 3 : 1} style={{ ...inputSt, resize: 'vertical', marginTop: 6 }} value={form[key]} onChange={(event) => setField(key, event.target.value)} /></label>)}
      </div></section>)}
      <section><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><h4>Секції профілю</h4><button type="button" style={btnS} disabled={saving} onClick={() => setField('profileSections', [...form.profileSections, { key: '', title: '', body: '' }])}>Додати секцію</button></div>
        <div style={{ display: 'grid', gap: 12 }}>{form.profileSections.map((item, index) => <div key={`${item.key || 'new'}-${index}`} style={{ ...cardSt, background: theme.input, padding: 14 }}>
          <label style={{ fontSize: 13 }}>Title<input style={{ ...inputSt, background: theme.card, marginTop: 5 }} value={item.title || ''} onChange={(event) => changeSection(index, { title: event.target.value })} /></label>
          <label style={{ display: 'block', fontSize: 13, marginTop: 10 }}>Body<textarea rows={4} style={{ ...inputSt, background: theme.card, resize: 'vertical', marginTop: 5 }} value={item.body || ''} onChange={(event) => changeSection(index, { body: event.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><OrderButtons index={index} total={form.profileSections.length} disabled={saving} onMove={(delta) => moveSection(index, delta)} /><button type="button" style={{ ...btnS, color: theme.danger, padding: '7px 12px' }} disabled={saving} onClick={() => setField('profileSections', form.profileSections.filter((_, i) => i !== index))}>Видалити</button></div>
        </div>)}</div>
      </section>
      {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" style={btnS} disabled={saving} onClick={onClose}>Скасувати</button><button type="button" style={btnP} disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти профіль'}</button></div>
    </div>
  </div>;
};

const TextContentEditor = ({ title, content, fields, onClose, onSave }) => {
  const textFields = fields.filter((key) => key !== 'logo_url');
  const [form, setForm] = useState(() => Object.fromEntries(textFields.map((key) => [key, content?.[key] || ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoUrl, setLogoUrl] = useState(content?.logo_url || '');
  const logoPreviewUrl = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : logoUrl, [logoFile, logoUrl]);
  useEffect(() => () => { if (logoFile && logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl); }, [logoFile, logoPreviewUrl]);
  const uploadLogo = async () => {
    setSaving(true); setError('');
    try { validateSiteLogo(logoFile); setLogoUrl(await db.uploadSiteHeaderLogo(logoFile)); setLogoFile(null); }
    catch (nextError) { setError(nextError?.message || 'Не вдалося завантажити логотип.'); }
    finally { setSaving(false); }
  };
  const removeLogo = async () => {
    setSaving(true); setError('');
    try { await db.removeSiteHeaderLogo(); setLogoUrl(''); setLogoFile(null); }
    catch (nextError) { setError(nextError?.message || 'Не вдалося прибрати логотип.'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave({ ...content, ...form, logo_url: logoUrl }); onClose(); }
    catch (nextError) { setError(nextError?.message || 'Не вдалося зберегти тексти.'); }
    finally { setSaving(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label={`Тексти: ${title}`} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,25,45,.55)', padding: 16, overflowY: 'auto' }}>
    <div style={{ ...cardSt, maxWidth: 820, margin: '24px auto', display: 'grid', gap: 18 }}>
      <div><h3 style={{ margin: 0 }}>Тексти: {title}</h3><p style={{ color: theme.textMuted, marginBottom: 0 }}>Порожнє поле = сайт використовує чинний текст із коду. Зберігаються лише дозволені поля цієї сторінки.</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {textFields.map((key) => <label key={key} style={{ fontSize: 13, fontWeight: 600 }}>{TEXT_LABELS[key] || key}<textarea rows={key.toLowerCase().includes('description') || key.toLowerCase().includes('message') ? 3 : 1} style={{ ...inputSt, resize: 'vertical', marginTop: 6 }} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
      </div>
      {fields.includes('logo_url') && <section style={{ ...cardSt, display: 'grid', gap: 12, background: theme.input }}>
        <div><h4 style={{ margin: 0 }}>Логотип сайту</h4><div style={{ color: theme.textMuted, fontSize: 12, marginTop: 5 }}>Прозорий PNG, рекомендована ширина від 500 px. Максимум 2 МБ.</div></div>
        {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Попередній перегляд логотипа" style={{ width: 'min(100%, 500px)', maxHeight: 180, objectFit: 'contain', objectPosition: 'left center' }} /> : <div style={{ color: theme.textMuted }}>Логотип не завантажено.</div>}
        <input aria-label="PNG-файл логотипа" type="file" accept="image/png" disabled={saving} onChange={(event) => { const file = event.target.files?.[0] || null; try { if (file) validateSiteLogo(file); setLogoFile(file); setError(''); } catch (nextError) { setLogoFile(null); setError(nextError.message); event.target.value = ''; } }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" style={btnP} disabled={saving || !logoFile} onClick={uploadLogo}>Завантажити</button><button type="button" style={{ ...btnS, color: theme.danger }} disabled={saving || (!logoUrl && !logoFile)} onClick={removeLogo}>Прибрати логотип</button></div>
      </section>}
      {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" style={btnS} disabled={saving} onClick={onClose}>Скасувати</button><button type="button" style={btnP} disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти тексти'}</button></div>
    </div>
  </div>;
};

const HomeSectionEditor = ({ sectionId, content, onClose, onSave }) => {
  const fields = HOME_SECTION_FIELDS[sectionId].filter((field) => field !== 'enabled');
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => [field, content?.[field] ?? ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave({ ...content, ...form }); onClose(); }
    catch (nextError) { setError(nextError?.message || 'Не вдалося зберегти секцію.'); }
    finally { setSaving(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label={`Секція: ${HOME_SECTION_LABELS[sectionId]}`} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,25,45,.55)', padding: 16, overflowY: 'auto' }}>
    <div style={{ ...cardSt, maxWidth: 720, margin: '24px auto', display: 'grid', gap: 18 }}>
      <div><h3 style={{ margin: 0 }}>Секція: {HOME_SECTION_LABELS[sectionId]}</h3><p style={{ color: theme.textMuted, marginBottom: 0 }}>Порожнє поле використовує базовий текст сайту.</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {fields.map((field) => {
          const label = SECTION_FIELD_LABELS[field] || field;
          if (field.endsWith('_page_key')) return <label key={field} style={{ fontSize: 13, fontWeight: 600 }}>{label}<select style={{ ...inputSt, marginTop: 6 }} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}><option value="">Базове посилання сайту</option>{SITE_CTA_PAGE_KEYS.map((pageKey) => <option key={pageKey} value={pageKey}>{PAGE_LABELS[pageKey]} ({pageKey})</option>)}</select></label>;
          if (field === 'featured_limit') return <label key={field} style={{ fontSize: 13, fontWeight: 600 }}>{label}<select style={{ ...inputSt, marginTop: 6 }} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value ? Number(event.target.value) : '' }))}><option value="">Базове значення сайту</option>{[1, 2, 3, 4, 5, 6].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select></label>;
          return <label key={field} style={{ fontSize: 13, fontWeight: 600 }}>{label}<textarea rows={field === 'description' ? 3 : 1} style={{ ...inputSt, resize: 'vertical', marginTop: 6 }} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} /></label>;
        })}
      </div>
      {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" style={btnS} disabled={saving} onClick={onClose}>Скасувати</button><button type="button" style={btnP} disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти секцію'}</button></div>
    </div>
  </div>;
};

export default function SiteTab() {
  const [data, setData] = useState({ pages: [], trainers: [], directions: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [section, setSection] = useState('pages');
  const [editingTrainer, setEditingTrainer] = useState(null);
  const [editingText, setEditingText] = useState(null);
  const [editingHomeSection, setEditingHomeSection] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await db.fetchSiteContentAdmin());
    } catch (nextError) {
      setError(nextError?.message || 'Не вдалося завантажити налаштування сайту.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      await load();
      setSuccess('Зміни збережено.');
    } catch (nextError) {
      setError(nextError?.message || 'Не вдалося зберегти зміни.');
    } finally {
      setBusy(false);
    }
  };

  const move = (items, index, delta, reorder) => run(async () => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    await reorder(next);
  });

  const menuPages = useMemo(
    () => data.pages.filter((page) => page.showInNavigation).sort((a, b) => a.sortOrder - b.sortOrder || a.pageKey.localeCompare(b.pageKey)),
    [data.pages],
  );
  const trainers = useMemo(() => [...data.trainers].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk')), [data.trainers]);
  const directions = useMemo(() => [...data.directions].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk')), [data.directions]);
  const groups = useMemo(() => data.groups.filter((group) => !isArchivedSiteGroup(group)), [data.groups]);

  if (loading && !data.pages.length) return <div style={cardSt}>Завантаження налаштувань сайту…</div>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0, color: theme.secondary }}>Сайт</h2><div style={{ color: theme.textMuted, fontSize: 13 }}>Публікація та порядок готового контенту</div></div>
        <button type="button" style={btnS} onClick={load} disabled={loading || busy}>Оновити</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['pages', 'Сторінки'], ['texts', 'Тексти сайту'], ['navigation', 'Меню'], ['trainers', 'Тренери'], ['directions', 'Напрямки'], ['groups', 'Групи на сайті']].map(([id, label]) => (
          <Pill key={id} active={section === id} onClick={() => setSection(id)}>{label}</Pill>
        ))}
      </div>
      {error && <div role="alert" style={{ ...cardSt, color: theme.danger, border: `1px solid ${theme.danger}` }}>{error}</div>}
      {success && <div role="status" style={{ ...cardSt, color: theme.success, border: `1px solid ${theme.success}` }}>{success}</div>}

      {section === 'pages' && <div style={{ display: 'grid', gap: 10 }}>
        {data.pages.map((page) => <Row key={page.pageKey} title={PAGE_LABELS[page.pageKey] || page.pageKey}
          subtitle={`Ключ: ${page.pageKey} · порядок ${page.sortOrder}`}
          status={<Badge color={page.isPublished ? theme.success : theme.textMuted}>{page.isPublished ? 'Опубліковано' : 'Приховано'}</Badge>}
          actions={<>
            <Toggle checked={page.isPublished} disabled={busy} onChange={(checked) => run(() => db.updateSitePage(page.pageKey, { isPublished: checked, ...(!checked ? { showInNavigation: false } : {}) }))}>Опубліковано</Toggle>
            <Toggle checked={page.showInNavigation} disabled={busy || !page.isPublished} onChange={(checked) => run(() => db.updateSitePage(page.pageKey, { showInNavigation: checked }))}>Показувати в меню</Toggle>
          </>} />)}
      </div>}

      {section === 'navigation' && <div style={{ display: 'grid', gap: 10 }}>
        {!menuPages.length && <div style={cardSt}>У меню немає видимих сторінок.</div>}
        {menuPages.map((page, index) => <Row key={page.pageKey} title={PAGE_LABELS[page.pageKey] || page.pageKey}
          subtitle={`Порядок: ${page.sortOrder}`}
          status={<Badge color={theme.success}>У меню</Badge>}
          actions={<OrderButtons index={index} total={menuPages.length} disabled={busy} onMove={(delta) => move(menuPages, index, delta, db.reorderSitePages)} />} />)}
      </div>}

      {section === 'texts' && <div style={{ display: 'grid', gap: 10 }}>
        {data.pages.map((page) => <Row key={page.pageKey} title={PAGE_LABELS[page.pageKey] || page.pageKey}
          subtitle={Object.keys(page.content || {}).length ? `Заповнено полів: ${Object.keys(page.content).length}` : 'Використовуються чинні тексти сайту'}
          actions={<button type="button" style={btnS} disabled={busy} onClick={() => setEditingText({ type: 'page', item: page })}>Редагувати тексти</button>} />)}
        {data.pages.find((page) => page.pageKey === 'home') && <section style={{ ...cardSt, display: 'grid', gap: 10 }}>
          <div><h3 style={{ margin: 0 }}>Секції головної сторінки</h3><div style={{ color: theme.textMuted, fontSize: 12, marginTop: 5 }}>Порядок секцій фіксований. Відсутні налаштування використовують базові значення сайту.</div></div>
          {HOME_SECTION_ORDER.map((sectionId) => {
            const home = data.pages.find((page) => page.pageKey === 'home');
            const sectionContent = home.content?.sections?.[sectionId];
            const enabled = typeof sectionContent?.enabled === 'boolean' ? sectionContent.enabled : HOME_SECTION_DEFAULT_ENABLED[sectionId];
            return <Row key={sectionId} title={HOME_SECTION_LABELS[sectionId]}
              subtitle={sectionContent ? `ID: ${sectionId}` : `ID: ${sectionId} · використовується базовий текст сайту`}
              status={<Badge color={enabled ? theme.success : theme.textMuted}>{enabled ? 'Показується' : 'Приховано'}</Badge>}
              actions={<><Toggle checked={enabled} disabled={busy} onChange={(checked) => run(() => db.updateHomeSection(sectionId, { ...(sectionContent || {}), enabled: checked }))}>Показувати на сайті</Toggle><button type="button" style={btnS} disabled={busy} onClick={() => setEditingHomeSection({ sectionId, content: sectionContent || {} })}>Редагувати</button></>} />;
          })}
        </section>}
      </div>}

      {section === 'trainers' && <div style={{ display: 'grid', gap: 10 }}>
        {trainers.map((trainer, index) => <Row key={trainer.trainerId} title={trainer.name}
          subtitle={`Статус: ${trainer.publicationStatus === 'published' ? 'готовий' : 'чернетка'} · порядок ${trainer.sortOrder}`}
          status={!trainer.isOperational ? <Badge color={theme.danger}>Недоступний у CRM</Badge> : <Badge color={trainer.showOnPublicSite ? theme.success : theme.textMuted}>{trainer.showOnPublicSite ? 'На сайті' : 'Приховано'}</Badge>}
          actions={<>
            <Toggle checked={trainer.showOnPublicSite} disabled={busy || !trainer.isOperational} onChange={(checked) => run(() => db.updateSiteTrainerProfile(trainer.trainerId, { showOnPublicSite: checked, ...(checked && trainer.publicationStatus === 'draft' ? { publicationStatus: 'published' } : {}) }))}>Показувати на сайті</Toggle>
            <button type="button" style={btnS} disabled={busy} onClick={() => setEditingTrainer(trainer)}>Редагувати профіль</button>
            <OrderButtons index={index} total={trainers.length} disabled={busy} onMove={(delta) => move(trainers, index, delta, db.reorderSiteTrainerProfiles)} />
          </>} />)}
      </div>}

      {section === 'directions' && <div style={{ display: 'grid', gap: 10 }}>
        {directions.map((direction, index) => <Row key={direction.directionId} title={direction.name}
          subtitle={`ID: ${direction.directionId} · slug: ${direction.publicSlug} · порядок ${direction.sortOrder}`}
          status={!direction.isOperational ? <Badge color={theme.danger}>Недоступний у CRM</Badge> : <Badge color={direction.showOnPublicSite ? theme.success : theme.textMuted}>{direction.showOnPublicSite ? 'На сайті' : 'Приховано'}</Badge>}
          actions={<>
            <Toggle checked={direction.showOnPublicSite} disabled={busy || !direction.isOperational} onChange={(checked) => run(() => db.updateSiteDirectionProfile(direction.directionId, { showOnPublicSite: checked, ...(checked && direction.publicationStatus === 'draft' ? { publicationStatus: 'published' } : {}) }))}>Показувати на сайті</Toggle>
            <button type="button" style={btnS} disabled={busy} onClick={() => setEditingText({ type: 'direction', item: direction })}>Редагувати тексти</button>
            <OrderButtons index={index} total={directions.length} disabled={busy} onMove={(delta) => move(directions, index, delta, db.reorderSiteDirectionProfiles)} />
          </>} />)}
      </div>}

      {section === 'groups' && <div style={{ display: 'grid', gap: 10 }}>
        {!groups.length && <div style={cardSt}>Немає неархівних груп.</div>}
        {groups.map((group) => {
          const blockers = getPublicGroupBlockers(group);
          const schedule = formatGroupScheduleLabel(group.schedule) || 'Не вказано';
          return <Row key={group.id} title={group.name}
            subtitle={`Напрямок: ${group.directionName} · Дні та години: ${schedule} · Старт: ${formatGroupStartDate(group.startDate)}`}
            status={blockers.length
              ? <Badge color={theme.danger}>Не з’явиться: {blockers.join('; ')}</Badge>
              : <Badge color={group.showOnPublicSite ? theme.success : theme.textMuted}>{group.showOnPublicSite ? 'На сайті' : 'Приховано'}</Badge>}
            actions={<Toggle checked={group.showOnPublicSite} disabled={busy} onChange={(checked) => run(() => db.updateSiteGroupVisibility(group.id, checked))}>Показувати на сайті</Toggle>} />;
        })}
      </div>}
      {busy && <div aria-live="polite" style={{ color: theme.textMuted, fontSize: 12 }}>Збереження…</div>}
      {editingTrainer && <TrainerContentEditor trainer={editingTrainer} onClose={() => setEditingTrainer(null)} onSaved={async () => { await load(); setSuccess('Текст профілю збережено.'); }} />}
      {editingText && <TextContentEditor
        title={editingText.type === 'page' ? (PAGE_LABELS[editingText.item.pageKey] || editingText.item.pageKey) : editingText.item.name}
        content={editingText.item.content}
        fields={editingText.type === 'page' ? SITE_PAGE_CONTENT_FIELDS[editingText.item.pageKey] : SITE_DIRECTION_CONTENT_FIELDS}
        onClose={() => setEditingText(null)}
        onSave={async (content) => {
          if (editingText.type === 'page') await db.updateSitePageContent(editingText.item.pageKey, content);
          else await db.updateSiteDirectionProfileContent(editingText.item.directionId, content);
          await load(); setSuccess('Тексти сайту збережено.');
        }} />}
      {editingHomeSection && <HomeSectionEditor sectionId={editingHomeSection.sectionId} content={editingHomeSection.content}
        onClose={() => setEditingHomeSection(null)}
        onSave={async (content) => { await db.updateHomeSection(editingHomeSection.sectionId, content); await load(); setSuccess('Секцію головної сторінки збережено.'); }} />}
    </div>
  );
}
