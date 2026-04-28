import React, { useMemo, useState } from "react";
import { Badge, Modal } from "./UI";
import { DIRECTIONS, PLAN_TYPES, cardSt, theme } from "../shared/constants";
import { fmt, getDisplayName, today } from "../shared/utils";

function DashCard({ title, value, subtitle, onClick, color }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...cardSt,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        border: `1px solid ${theme.border}`,
        cursor: onClick ? "pointer" : "default",
        transition: "0.2s",
      }}
      onMouseOver={(e) =>
        onClick &&
        ((e.currentTarget.style.transform = "translateY(-2px)"),
        (e.currentTarget.style.boxShadow = `0 12px 30px ${theme.border}`))
      }
      onMouseOut={(e) =>
        onClick &&
        ((e.currentTarget.style.transform = "none"),
        (e.currentTarget.style.boxShadow = "none"))
      }
    >
      <div style={{ fontSize: 13, color: theme.textLight, textTransform: "uppercase", fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color: color || theme.textMain }}>{value}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>{subtitle}</div>
    </div>
  );
}

export default function DashboardTab({ analytics, activeSubs, subs, studentMap, groupMap }) {
  const [dashModal, setDashModal] = useState(null);

  const modalItems = useMemo(() => {
    if (!dashModal) return [];
    return analytics.currMonthDetails[dashModal.type] || [];
  }, [dashModal, analytics]);

  const renderDashModal = () => {
    if (!dashModal) return null;

    if (dashModal.type === "activeSubs") {
      return (
        <Modal open={true} onClose={() => setDashModal(null)} title={dashModal.title}>
          {activeSubs.length === 0 ? (
            <div style={{ color: theme.textLight, textAlign: "center", padding: 40 }}>Немає даних</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeSubs.map((s, i) => {
                const st = studentMap[s?.studentId];
                const gr = groupMap[s?.groupId];
                const planName = PLAN_TYPES.find((p) => p.id === s?.planType)?.name;
                return (
                  <div
                    key={i}
                    style={{
                      padding: 16,
                      background: theme.bg,
                      borderRadius: 16,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: theme.textMain }}>{getDisplayName(st)}</div>
                      <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                        {gr?.name || "Невідома група"}
                      </div>
                    </div>
                    <Badge color={theme.success}>{planName || "Абонемент"}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      );
    }

    return (
      <Modal open={true} onClose={() => setDashModal(null)} title={dashModal.title}>
        {!modalItems || modalItems.length === 0 ? (
          <div style={{ color: theme.textLight, textAlign: "center", padding: 40 }}>Немає даних</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {modalItems.map((item, i) => {
              let st = null;
              if (item?.studentId) {
                st = studentMap[item.studentId];
              } else if (item?.subId) {
                const foundSub = subs.find((s) => s.id === item.subId);
                if (foundSub) st = studentMap[foundSub.studentId];
              } else if (item?.guestName) {
                st = Object.values(studentMap).find((s) => s.name === item.guestName);
              }

              const gr = groupMap[item?.groupId];
              const dateStr = item?.startDate || item?.date || "Невідома дата";

              return (
                <div
                  key={i}
                  style={{
                    padding: 16,
                    background: theme.bg,
                    borderRadius: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: theme.textMain }}>
                      {getDisplayName(st || { name: item?.guestName || "Невідомо" })}
                    </div>
                    <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                      {gr?.name || "Невідома група"}
                    </div>
                  </div>
                  <Badge color={theme.primary}>{fmt(dateStr)}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    );
  };

  return (
    <>
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          <DashCard
            title="Учениць"
            value={analytics.totalStudents}
            subtitle={`${analytics.activeStudents} активних`}
            color={theme.primary}
          />
          <DashCard
            title="Абонементів"
            value={activeSubs.length}
            subtitle={`${analytics.currMonthStats.cancelledCount} скасувань`}
            color={theme.success}
            onClick={() => setDashModal({ type: "activeSubs", title: "Всі активні абонементи" })}
          />
          <DashCard
            title="Дохід (Цього міс.)"
            value={`${analytics.currMonthRev.toLocaleString()}₴`}
            subtitle={`Минулий: ${analytics.prevMonthRev.toLocaleString()}₴`}
            color={theme.warning}
          />
        </div>

        <h3 style={{ color: theme.secondary, fontSize: 20, marginBottom: 16, fontWeight: 800 }}>
          Цього місяця ({today().slice(0, 7)})
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 16,
            marginBottom: 30,
          }}
        >
          <DashCard onClick={() => setDashModal({ type: "trial", title: "Пробні тренування" })} title="Пробні" value={analytics.currMonthStats.trial} />
          <DashCard onClick={() => setDashModal({ type: "single", title: "Разові тренування" })} title="Разові" value={analytics.currMonthStats.single} />
          <DashCard onClick={() => setDashModal({ type: "pack4", title: "Абонементи 4" })} title="Абонементи 4" value={analytics.currMonthStats.pack4} />
          <DashCard onClick={() => setDashModal({ type: "pack8", title: "Абонементи 8" })} title="Абонементи 8" value={analytics.currMonthStats.pack8} />
          <DashCard onClick={() => setDashModal({ type: "pack12", title: "Абонементи 12" })} title="Абонементи 12" value={analytics.currMonthStats.pack12} />
          <DashCard onClick={() => setDashModal({ type: "unpaidAttn", title: "Боргові тренування" })} title="Боргові трен." value={analytics.currMonthStats.unpaidAttn} color={theme.danger} />
        </div>

        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, marginBottom: 40 }}>
          <h3 style={{ color: theme.secondary, fontSize: 18, marginBottom: 24, fontWeight: 800 }}>
            Графік відвідуваності
          </h3>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 180,
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 8,
              paddingTop: 30,
            }}
          >
            {analytics.chartData.map((d) => {
              const barHeightPx = d.count > 0 ? Math.max((d.count / analytics.maxChartVal) * 120, 8) : 4;
              return (
                <div
                  key={d.day}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    minWidth: 32,
                  }}
                >
                  <div style={{ fontSize: 12, color: theme.textMain, fontWeight: 800, opacity: d.count > 0 ? 1 : 0, marginBottom: 4 }}>
                    {d.count}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      background: d.count > 0 ? theme.primary : theme.input,
                      borderRadius: 8,
                      height: `${barHeightPx}px`,
                      transition: "all 0.3s",
                    }}
                  />
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 10, fontWeight: 600 }}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        <h3 style={{ color: theme.secondary, fontSize: 20, marginBottom: 16, fontWeight: 800 }}>
          За напрямками
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
          {DIRECTIONS.map((d) => (
            <div
              key={d.id}
              style={{
                ...cardSt,
                padding: "20px",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 110,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: d.color, marginBottom: 8 }}>{d.name}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: theme.textMain }}>
                {analytics.byDir[d.id]?.students || 0}{" "}
                <span style={{ fontSize: 14, color: theme.textLight, fontWeight: 600 }}>уч.</span>
              </div>
            </div>
          ))}
        </div>

        {analytics.foundation && (
          <div style={{ ...cardSt, border: `1px dashed ${theme.border}`, marginTop: 24 }}>
            <h3 style={{ color: theme.secondary, fontSize: 16, marginBottom: 12, fontWeight: 800 }}>
              Analytics foundation preview ({analytics.foundation.period.key})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              {analytics.foundation.ui.kpiTiles.map((tile) => (
                <div key={tile.id} style={{ background: theme.bg, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{tile.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: theme.textMain }}>{tile.value}</div>
                  <div style={{ fontSize: 12, color: tile.trend.delta >= 0 ? theme.success : theme.danger }}>
                    Δ {tile.trend.delta >= 0 ? "+" : ""}{tile.trend.delta} ({tile.trend.deltaPct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {renderDashModal()}
    </>
  );
}
