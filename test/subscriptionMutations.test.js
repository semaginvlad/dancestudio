import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canEditSubscription,
  commitThenRefresh,
  composeSubscriptionNotice,
  createSynchronousGuard,
  refreshSubscriptionsOnly,
  subscriptionErrorMessage,
} from "../src/subscriptionMutations.js";

test("subscription notices compose conversion and refresh outcomes", () => {
  const conversionWarning = "Не вдалося автоматично погасити борг.";

  assert.deepEqual(
    composeSubscriptionNotice({ followUpWarning: conversionWarning, refreshed: true }),
    { type: "warning", message: conversionWarning },
    "conversion failure alone produces its warning",
  );

  const refreshOnly = composeSubscriptionNotice({ refreshed: false });
  assert.equal(refreshOnly.type, "warning", "refresh failure alone produces a warning");
  assert.equal(refreshOnly.retryable, true, "refresh failure is always retryable");
  assert.match(refreshOnly.message, /список не вдалося оновити/);

  const combined = composeSubscriptionNotice({ followUpWarning: conversionWarning, refreshed: false });
  assert.equal(combined.retryable, true, "combined failure remains retryable");
  assert.match(combined.message, new RegExp(conversionWarning));
  assert.match(combined.message, /список не вдалося оновити/, "combined message includes the refresh warning");
});

test("only the subscription with a pending delete is blocked from editing", () => {
  const deletingSubscriptionIds = new Set(["deleting-id"]);
  assert.equal(canEditSubscription({ id: "deleting-id" }, deletingSubscriptionIds), false);
  assert.equal(canEditSubscription({ id: "other-id" }, deletingSubscriptionIds), true);

  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /const openSubscriptionEdit = \(subscription\) => \{\s*if \(!canEditSubscription\(subscription, deletingSubscriptionIds\)\) return false;/);
  assert.match(app, /onActionEditSub: openSubscriptionEdit/);
  assert.match(app, /className="payment-card" disabled=\{!canEditSubscription\(sub, deletingSubscriptionIds\)\}/);
  assert.match(app, /aria-label="Редагувати оплату" disabled=\{!canEditSubscription\(sub, deletingSubscriptionIds\)\}/);
  assert.doesNotMatch(app, /setEditItem\(sub\);setModal\("editSub"\)/);
});

test("failed create/update/delete never applies local financial state", async () => {
  for (const action of ["create", "update", "delete"]) {
    const local = [{ id: "existing", amount: 100 }];
    await assert.rejects(commitThenRefresh({
      mutate: async () => { throw new Error(`${action} denied`); },
      applyCanonical: (row) => local.push(row),
      refresh: async () => [],
      applyRefresh: (rows) => local.splice(0, local.length, ...rows),
    }), new RegExp(`${action} denied`));
    assert.deepEqual(local, [{ id: "existing", amount: 100 }]);
    assert.match(subscriptionErrorMessage(action, new Error("RLS")), /RLS/);
  }
});

test("synchronous guard rejects a duplicate submit and is reusable after finally", async () => {
  const guard = createSynchronousGuard();
  let requests = 0;
  let releaseRequest;
  const request = () => {
    if (!guard.tryLock()) return Promise.resolve(false);
    requests += 1;
    return new Promise((resolve) => { releaseRequest = () => { guard.release(); resolve(true); }; });
  };
  const first = request();
  assert.equal(await request(), false);
  assert.equal(requests, 1);
  releaseRequest();
  assert.equal(await first, true);
  assert.equal(guard.tryLock(), true);
  requests += 1;
  guard.release();
  assert.equal(requests, 2);
});

test("committed mutation uses canonical response when refresh fails and refresh retry does not repeat mutation", async () => {
  const canonical = { id: "server-id", amount: 1500, paid: true };
  let mutations = 0;
  let refreshes = 0;
  let local = [];
  let warning = "";
  const result = await commitThenRefresh({
    mutate: async () => { mutations += 1; return canonical; },
    applyCanonical: (row) => { local = [row]; },
    refresh: async () => { refreshes += 1; throw new Error("offline"); },
    applyRefresh: (rows) => { local = rows; },
    onRefreshFailure: () => { warning = "saved, refresh needed"; },
  });
  assert.equal(result.refreshed, false);
  assert.deepEqual(local, [canonical]);
  assert.equal(warning, "saved, refresh needed");

  // The UI retry calls only the read operation, never commitThenRefresh/mutate.
  const retryRefresh = async () => { refreshes += 1; local = [{ ...canonical, paid: false }]; };
  await retryRefresh();
  assert.equal(mutations, 1);
  assert.equal(refreshes, 2);
  assert.equal(local[0].paid, false);
});

test("refresh-only retry remains available through repeated failures and clears after success", async () => {
  let financialMutations = 1; // The already-committed mutation that produced the warning.
  let refreshAttempts = 0;
  let subscriptions = [{ id: "canonical" }];
  let notice = { type: "warning", retryable: true, message: "saved; refresh failed" };
  const retry = () => refreshSubscriptionsOnly({
    fetchSubscriptions: async () => {
      refreshAttempts += 1;
      if (refreshAttempts < 4) throw new Error(`offline ${refreshAttempts}`);
      return [{ id: "canonical", paid: true }];
    },
    applySubscriptions: (rows) => { subscriptions = rows; },
    setNotice: (next) => { notice = next; },
  });

  assert.equal(notice.retryable, true, "first committed refresh failure exposes retry");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assert.equal(await retry(), false);
    assert.equal(notice.type, "error");
    assert.equal(notice.retryable, true, `failed retry ${attempt} remains retryable`);
  }
  assert.equal(await retry(), true);
  assert.equal(notice, null, "successful retry clears the notice");
  assert.deepEqual(subscriptions, [{ id: "canonical", paid: true }]);
  assert.equal(financialMutations, 1, "refresh retry never repeats the financial mutation");
});

test("success path replaces canonical state with successfully reloaded rows", async () => {
  let local = [];
  const result = await commitThenRefresh({
    mutate: async () => ({ id: "canonical" }),
    applyCanonical: (row) => { local = [row]; },
    refresh: async () => [{ id: "canonical", paid: true }],
    applyRefresh: (rows) => { local = rows; },
  });
  assert.equal(result.refreshed, true);
  assert.deepEqual(local, [{ id: "canonical", paid: true }]);
});

test("subscription form keeps draft/modal ownership on error and exposes an accessible alert", () => {
  const form = fs.readFileSync(new URL("../src/components/Forms.jsx", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../src/components/UI.jsx", import.meta.url), "utf8");
  assert.match(form, /role="alert"/);
  assert.match(form, /catch \(error\)[\s\S]*setSubmitError/);
  assert.match(form, /finally[\s\S]*submitGuard\.current\.release\(\)/);
  assert.match(form, /setSubmitting\(true\);\s*onPendingChange\?\.\(true\)/);
  assert.match(form, /finally[\s\S]*onPendingChange\?\.\(false\)/);
  assert.doesNotMatch(form, /catch \(error\)[\s\S]{0,180}onCancel/);
  assert.doesNotMatch(app, /id: uid\(\), \.\.\.compensatedPayload/);
  assert.match(app, /await db\.deleteSub\(id\);[\s\S]*setSubs/);
  assert.match(app, /onDone=\{updateSubscriptionAction\}/);
  assert.match(app, /closeDisabled=\{subscriptionMutationPending\}/);
  assert.match(ui, /onClick=\{\(\) => \{ if \(!closeDisabled\) onClose\?\.\(\); \}\}/, "backdrop close is blocked while pending");
  assert.match(ui, /disabled=\{closeDisabled\} onClick=\{onClose\}/, "header close is blocked while pending");
  assert.match(ui, /if \(!open \|\| closeDisabled\) return undefined;[\s\S]*event\.key === "Escape"/, "Escape close is blocked while pending");
  assert.match(ui, /\[closeDisabled, onClose, open\]/, "close handlers are restored after pending ends");
});

test("subscription warning is shared with AttendanceTab and retry remains refresh-only", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const noticeIndex = app.indexOf('data-subscription-notice');
  const dashboardIndex = app.indexOf("<DashboardTab");
  const scheduleIndex = app.indexOf("<ScheduleTab");
  const attendanceIndex = app.indexOf('{tab === "attendance" && <AttendanceTab');
  const paymentsIndex = app.indexOf('{isAdmin && tab==="subs"');
  assert.ok(noticeIndex < dashboardIndex, "notice is rendered before DashboardTab");
  assert.ok(noticeIndex < scheduleIndex, "notice is rendered before ScheduleTab");
  assert.ok(noticeIndex > 0 && noticeIndex < attendanceIndex, "notice is rendered outside and before AttendanceTab");
  assert.ok(noticeIndex < paymentsIndex, "notice is not scoped to the payments tab");
  assert.match(app, /data-subscription-notice[\s\S]*role="alert"|role="alert" data-subscription-notice/);
  assert.match(app, /type: "warning", retryable: true/);
  assert.match(app, /subscriptionNotice\.retryable && <button/);
  const retryBody = app.match(/const retrySubscriptionsRefresh = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.match(retryBody, /refreshSubscriptionsOnly/);
  assert.doesNotMatch(retryBody, /insertSub|updateSub|deleteSub|convertDebtAttendance/);
  const helper = fs.readFileSync(new URL("../src/subscriptionMutations.js", import.meta.url), "utf8");
  assert.match(helper, /type: "error",\s*retryable: true/);
  assert.match(helper, /applySubscriptions\(subscriptions\);\s*setNotice\(null\)/);
});
