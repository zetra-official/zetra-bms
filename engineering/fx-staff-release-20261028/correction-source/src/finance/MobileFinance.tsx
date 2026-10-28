import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type TextFn = (source: string) => string;
type Row = { storeId: string; storeName: string; sales: number; moneyIn: number; expenses: number; orders: number; stockValue: number; profit: number | null };
type Totals = Omit<Row, "storeId" | "storeName" | "profit"> & { profit: number };
const colors = { ink: "#102A35", muted: "#526777", green: "#007D67", line: "#DBE8ED" };
type IconName = React.ComponentProps<typeof Ionicons>["name"];

function Icon({ name, tone = "green" }: { name: IconName; tone?: "green" | "rose" | "blue" | "gold" }) {
  const palette = { green: ["#E4F7F0", "#007D67"], rose: ["#FFF0F3", "#BA375B"], blue: ["#EAF3FF", "#2563A8"], gold: ["#FFF4D9", "#996300"] }[tone];
  return <View style={[s.icon, { backgroundColor: palette[0] }]}><Ionicons name={name} size={21} color={palette[1]} /></View>;
}

export function MobileFinanceEntry({ text, onOpen }: { text: TextFn; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [s.entry, { opacity: pressed ? 0.85 : 1 }]}>
    <View style={s.row}><Icon name="stats-chart" /><View style={s.flex}><Text style={s.eyebrow}>{text("BUSINESS HUB")}</Text><Text style={s.entryTitle}>{text("Business Finance")}</Text></View><Ionicons name="arrow-forward" size={22} color={colors.green} /></View>
    <Text style={s.description}>{text("Tap to view sales, expenses and profit")}</Text>
    <View style={s.entryFooter}><Text style={s.link}>{text("View Details →")}</Text><Text style={s.caption}>{text("Sales")} · {text("Expenses")} · {text("Stock Value")}</Text></View>
  </Pressable>;
}

type Props = {
  text: TextFn; orgName: string; scope: "ALL" | "STORE"; canAll: boolean; isOwner: boolean;
  storeOptions: { storeId: string; storeName: string }[]; selectedStoreId: string;
  onScope: (scope: "ALL" | "STORE") => void; onStore: (id: string) => void;
  onBack: () => void; onRefresh: () => void; onDetail: (row: Row) => void;
  rows: Row[]; totals: Totals; available: boolean; loading: boolean; error: string | null;
  money: (value: number) => string;
};

/** Presentation only. Canonical RPCs, scope, sorting and money calculations stay in the route. */
export function MobileFinance(props: Props) {
  const { text: t, scope, canAll, isOwner, storeOptions, rows, totals, money, available, loading } = props;
  const current = storeOptions.find(row => row.storeId === props.selectedStoreId);
  const scopeLabel = scope === "ALL" && canAll ? `${t("ALL STORES")} (${storeOptions.length})` : current?.storeName ?? "—";
  const amount = (n: number) => available ? money(n) : "—";
  const metrics: { key: string; label: string; value: string; icon: IconName; tone?: "green" | "rose" | "blue" | "gold"; hint?: string }[] = [
    { key: "sales", label: t("Sales"), value: amount(totals.sales), icon: "cart-outline" },
    { key: "moneyIn", label: t("Money In"), value: amount(totals.moneyIn), icon: "wallet-outline" },
    { key: "expenses", label: t("Expenses"), value: amount(totals.expenses), icon: "receipt-outline", tone: "rose" },
    { key: "orders", label: t("Orders"), value: available ? String(totals.orders) : "—", icon: "document-text-outline", tone: "blue" },
    { key: "stockValue", label: t("Stock Value"), value: isOwner ? amount(totals.stockValue) : "—", icon: "cube-outline", tone: "gold" },
    { key: "profit", label: t("Profit"), value: isOwner ? amount(totals.profit) : "—", icon: "bar-chart-outline", hint: t(isOwner ? "owner-only" : "owner only") },
  ];
  const storeMetrics = (row: Row) => <View style={s.storeMetrics}>
    {[
      { key: "sales", label: t("Sales"), value: money(row.sales) },
      { key: "moneyIn", label: t("Money In"), value: money(row.moneyIn) },
      { key: "orders", label: t("Orders"), value: String(row.orders) },
      { key: "profit", label: t("Profit"), value: isOwner ? money(row.profit ?? 0) : "—" },
    ].map(metric => <View key={metric.key} style={s.storeMetric}><Text style={s.caption}>{metric.label}</Text><Text style={s.smallAmount}>{metric.value}</Text></View>)}
  </View>;
  return <ScrollView testID="mobile-finance" showsVerticalScrollIndicator={false} style={s.page} contentContainerStyle={s.content}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Back")} onPress={props.onBack} style={s.roundButton}><Ionicons name="arrow-back" color={colors.ink} size={21} /></Pressable>
      <View style={s.flex}><Text style={s.title}>{t("FINANCE")}</Text><Text style={s.subtitle}>{props.orgName} · {scopeLabel}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Refresh")} onPress={props.onRefresh} disabled={loading} style={[s.roundButton, s.refresh]}>{loading ? <ActivityIndicator color={colors.green} /> : <Ionicons name="refresh" color={colors.green} size={22} />}</Pressable>
    </View>

    <View style={s.segment}>
      {(canAll ? ["ALL", "STORE"] as const : ["STORE"] as const).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: scope === mode }} onPress={() => props.onScope(mode)} style={[s.segmentButton, scope === mode && s.segmentActive]}>
        <Ionicons name={mode === "ALL" ? "business-outline" : "storefront-outline"} size={18} color={scope === mode ? "#FFFFFF" : colors.muted} />
        <Text style={[s.segmentText, scope === mode && s.segmentActiveText]}>{t(mode === "ALL" ? "ALL STORES" : "STORE")}</Text>
      </Pressable>)}
    </View>
    {scope === "STORE" && <View style={s.storePicker}>{storeOptions.map(store => <Pressable key={store.storeId} accessibilityRole="button" accessibilityState={{ selected: store.storeId === props.selectedStoreId }} onPress={() => props.onStore(store.storeId)} style={[s.storeChip, store.storeId === props.selectedStoreId && s.storeChipActive]}><Text style={s.chipText}>{store.storeName}</Text></Pressable>)}</View>}

    {props.error && <View accessibilityRole="alert" style={s.error}><Text style={s.errorText}>{props.error}</Text></View>}
    <View style={s.hero} testID="finance-overview">
      <View style={s.row}><View style={s.dot} /><Text style={s.heroTitle}>{t("Live Overview • Today")}</Text></View>
      <Text style={s.caption}>{props.orgName} · {scopeLabel}</Text>
      <View style={s.heroAmountBlock}><Text style={s.description}>{t("Sales")}</Text><Text style={s.heroAmount}>{amount(totals.sales)}</Text></View>
      <View style={s.heroFooter}><Text style={s.heroFooterLabel}>{t("Orders")} <Text style={s.heroFooterValue}>{available ? totals.orders : "—"}</Text></Text><Text style={s.heroFooterLabel}>{t("Money In")} <Text style={s.heroFooterValue}>{amount(totals.moneyIn)}</Text></Text></View>
    </View>

    <View style={s.metricGrid}>{metrics.map(metric => <View key={metric.key} testID={`finance-metric-${metric.key}`} style={s.metricCard}><View style={s.row}><Icon name={metric.icon} tone={metric.tone} /><Text style={s.metricLabel}>{metric.label}</Text></View><Text style={s.metricAmount}>{metric.value}</Text>{metric.hint && <Text style={s.caption}>{metric.hint}</Text>}</View>)}</View>

    {available && scope === "ALL" && rows.length > 0 && <View style={s.topCard} testID="finance-top-performer"><View style={s.row}><Icon name="trophy-outline" tone="gold" /><View style={s.flex}><Text style={s.description}>{t("Top Performer Today:")}</Text><Text style={s.storeName}>{rows[0].storeName}</Text></View><Text style={s.topBadge}>{t("TOP #")}1</Text></View>{storeMetrics(rows[0])}</View>}

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>{t("LIVE SCOPE")}</Text><Text style={s.caption}>{scopeLabel}</Text></View>
    {available && rows.map((row, index) => <View key={row.storeId} testID="finance-store-card" style={s.storeCard}><View style={s.row}><View style={[s.rank, index === 0 && s.rankTop]}><Text style={s.rankText}>{index + 1}</Text></View><View style={s.flex}><Text style={s.storeName}>{row.storeName}</Text><Text style={s.caption}>{t(index === 0 ? "Top performer right now" : "Live store snapshot")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${t("OPEN DETAIL")} ${row.storeName}`} onPress={() => props.onDetail(row)} style={s.roundButton}><Ionicons name="arrow-forward" color={colors.green} size={20} /></Pressable></View>{storeMetrics(row)}</View>)}
    {!loading && !props.error && !rows.length && <View style={s.storeCard}><Text style={s.description}>{t("No live store data yet.")}</Text></View>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#EFF5F8" }, content: { padding: 16, paddingBottom: 36, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" },
  flex: { flex: 1, minWidth: 0 }, row: { flexDirection: "row", alignItems: "center", gap: 10 }, header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  title: { fontFamily: "system-ui", fontSize: 26, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 }, subtitle: { fontFamily: "system-ui", fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 3 },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.line }, refresh: { backgroundColor: "#E7F7F1", borderColor: "#C4E8DC" },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: colors.line, padding: 4, borderRadius: 18, backgroundColor: "#FFFFFF", gap: 4 }, segmentButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 14, padding: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, segmentActive: { backgroundColor: colors.green }, segmentText: { fontFamily: "system-ui", fontSize: 12, fontWeight: "800", color: colors.muted, flexShrink: 1 }, segmentActiveText: { color: "#FFFFFF" },
  storePicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, storeChip: { borderWidth: 1, borderColor: colors.line, backgroundColor: "#FFFFFF", borderRadius: 14, minHeight: 44, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 10, maxWidth: "100%" }, storeChipActive: { backgroundColor: "#DDF4EB", borderColor: "#91D5BF" }, chipText: { fontFamily: "system-ui", color: colors.ink, fontWeight: "700", fontSize: 13 },
  hero: { borderRadius: 24, borderWidth: 1, borderColor: "#BFE6DB", backgroundColor: "#F2FCF8", padding: 20, gap: 8, boxShadow: "0 8px 24px rgba(14, 78, 65, 0.06)" }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#07986E" }, heroTitle: { fontFamily: "system-ui", fontSize: 17, fontWeight: "800", color: colors.ink, flexShrink: 1 }, heroAmountBlock: { marginTop: 10, gap: 5 }, heroAmount: { fontFamily: "system-ui", fontSize: 31, fontWeight: "900", letterSpacing: -0.8, color: "#073F36", fontVariant: ["tabular-nums"], ...({ overflowWrap: "anywhere" } as any) }, heroFooter: { borderTopWidth: 1, borderTopColor: "#D7ECE4", paddingTop: 12, marginTop: 8, gap: 6 }, heroFooterLabel: { fontFamily: "system-ui", color: colors.muted, fontSize: 12, lineHeight: 19 }, heroFooterValue: { fontFamily: "system-ui", color: colors.ink, fontWeight: "800" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metricCard: { flexBasis: "46%", flexGrow: 1, minWidth: 0, backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E1EAF0", padding: 14, gap: 12, boxShadow: "0 4px 14px rgba(26, 56, 72, 0.03)" }, icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 }, metricLabel: { fontFamily: "system-ui", flex: 1, minWidth: 0, fontSize: 12, fontWeight: "700", color: colors.muted, lineHeight: 17 }, metricAmount: { fontFamily: "system-ui", color: colors.ink, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"], ...({ overflowWrap: "anywhere" } as any) },
  caption: { fontFamily: "system-ui", color: colors.muted, fontSize: 11, lineHeight: 16 }, description: { fontFamily: "system-ui", color: colors.muted, fontSize: 13, lineHeight: 19 }, topCard: { backgroundColor: "#FFFEF7", borderWidth: 1, borderColor: "#EEE3BF", borderRadius: 22, padding: 16, gap: 14 }, topBadge: { fontFamily: "system-ui", backgroundColor: "#FFF0C8", color: "#805400", borderRadius: 12, padding: 8, fontSize: 10, fontWeight: "900" }, storeName: { fontFamily: "system-ui", color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 2, ...({ overflowWrap: "anywhere" } as any) },
  storeMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, borderTopWidth: 1, borderTopColor: "#E3ECEC", paddingTop: 12 }, storeMetric: { flexBasis: "43%", flexGrow: 1, minWidth: 0, gap: 3 }, smallAmount: { fontFamily: "system-ui", color: colors.ink, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"], ...({ overflowWrap: "anywhere" } as any) }, sectionHeading: { gap: 4, marginTop: 4 }, sectionTitle: { fontFamily: "system-ui", color: colors.ink, fontSize: 15, fontWeight: "800" }, storeCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 16, gap: 14 }, rank: { width: 30, height: 34, borderRadius: 10, backgroundColor: "#EDF2F6", alignItems: "center", justifyContent: "center" }, rankTop: { backgroundColor: "#FFF0C8" }, rankText: { fontFamily: "system-ui", fontSize: 13, fontWeight: "900", color: colors.ink },
  error: { padding: 14, borderRadius: 16, backgroundColor: "#FFF0F0", borderWidth: 1, borderColor: "#F1C5C5" }, errorText: { fontFamily: "system-ui", color: "#A52B36", fontWeight: "700", lineHeight: 21 },
  entry: { backgroundColor: "#F1FCF7", borderWidth: 1, borderColor: "#C6E7DC", borderRadius: 22, padding: 18, marginBottom: 6, gap: 14 }, eyebrow: { fontFamily: "system-ui", color: colors.green, fontSize: 10, fontWeight: "800", letterSpacing: 1 }, entryTitle: { fontFamily: "system-ui", color: colors.ink, fontSize: 20, fontWeight: "900", marginTop: 4 }, entryFooter: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#D4EADF" }, link: { fontFamily: "system-ui", color: colors.green, fontSize: 12, fontWeight: "800" },
});
