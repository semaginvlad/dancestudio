import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../db';
import { Badge, Pill } from './UI';
import { btnS, cardSt, theme } from '../shared/constants';

const PAGE_LABELS = {
  home: 'Головна',
  schedule: 'Розклад',
  directions: 'Напрямки',
  coaches: 'Тренери',
  about: 'Про студію',
  join: 'Приєднатися',
  directions_quiz: 'Квіз напрямків',
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

export default function SiteTab() {
  const [data, setData] = useState({ pages: [], trainers: [], directions: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState('pages');

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
    try {
      await action();
      await load();
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

  if (loading && !data.pages.length) return <div style={cardSt}>Завантаження налаштувань сайту…</div>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0, color: theme.secondary }}>Сайт</h2><div style={{ color: theme.textMuted, fontSize: 13 }}>Публікація та порядок готового контенту</div></div>
        <button type="button" style={btnS} onClick={load} disabled={loading || busy}>Оновити</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['pages', 'Сторінки'], ['navigation', 'Меню'], ['trainers', 'Тренери'], ['directions', 'Напрямки']].map(([id, label]) => (
          <Pill key={id} active={section === id} onClick={() => setSection(id)}>{label}</Pill>
        ))}
      </div>
      {error && <div role="alert" style={{ ...cardSt, color: theme.danger, border: `1px solid ${theme.danger}` }}>{error}</div>}

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

      {section === 'trainers' && <div style={{ display: 'grid', gap: 10 }}>
        {trainers.map((trainer, index) => <Row key={trainer.trainerId} title={trainer.name}
          subtitle={`Статус: ${trainer.publicationStatus === 'published' ? 'готовий' : 'чернетка'} · порядок ${trainer.sortOrder}`}
          status={!trainer.isOperational ? <Badge color={theme.danger}>Недоступний у CRM</Badge> : <Badge color={trainer.showOnPublicSite ? theme.success : theme.textMuted}>{trainer.showOnPublicSite ? 'На сайті' : 'Приховано'}</Badge>}
          actions={<>
            <Toggle checked={trainer.showOnPublicSite} disabled={busy || !trainer.isOperational} onChange={(checked) => run(() => db.updateSiteTrainerProfile(trainer.trainerId, { showOnPublicSite: checked, ...(checked && trainer.publicationStatus === 'draft' ? { publicationStatus: 'published' } : {}) }))}>Показувати на сайті</Toggle>
            <OrderButtons index={index} total={trainers.length} disabled={busy} onMove={(delta) => move(trainers, index, delta, db.reorderSiteTrainerProfiles)} />
          </>} />)}
      </div>}

      {section === 'directions' && <div style={{ display: 'grid', gap: 10 }}>
        {directions.map((direction, index) => <Row key={direction.directionId} title={direction.name}
          subtitle={`ID: ${direction.directionId} · slug: ${direction.publicSlug} · порядок ${direction.sortOrder}`}
          status={!direction.isOperational ? <Badge color={theme.danger}>Недоступний у CRM</Badge> : <Badge color={direction.showOnPublicSite ? theme.success : theme.textMuted}>{direction.showOnPublicSite ? 'На сайті' : 'Приховано'}</Badge>}
          actions={<>
            <Toggle checked={direction.showOnPublicSite} disabled={busy || !direction.isOperational} onChange={(checked) => run(() => db.updateSiteDirectionProfile(direction.directionId, { showOnPublicSite: checked, ...(checked && direction.publicationStatus === 'draft' ? { publicationStatus: 'published' } : {}) }))}>Показувати на сайті</Toggle>
            <OrderButtons index={index} total={directions.length} disabled={busy} onMove={(delta) => move(directions, index, delta, db.reorderSiteDirectionProfiles)} />
          </>} />)}
      </div>}
      {busy && <div aria-live="polite" style={{ color: theme.textMuted, fontSize: 12 }}>Збереження…</div>}
    </div>
  );
}
