import { theme } from "@/src/ui/theme";
import React from "react";
import { Text, View } from "react-native";

export type Payment = {
  id: string;
  amount: number;
  payment_date: string | null;
  note: string | null;
  method: string | null;
  reference: string | null;
};

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${n}`;
  }
}

export default function PaymentRow({ payment }: { payment: Payment }) {
  const d = payment.payment_date ? new Date(payment.payment_date) : null;

  return (
    <View
      style={{
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.06)",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {payment.method ? String(payment.method).toUpperCase() : "PAYMENT"}
        </Text>
        <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
          {fmtTZS(Number(payment.amount ?? 0))}
        </Text>
      </View>

      <Text style={{ color: theme.colors.faint, marginTop: 4, fontSize: 12 }}>
        {d ? d.toLocaleString() : "—"}
        {payment.reference ? ` • ${payment.reference}` : ""}
      </Text>

      {!!payment.note && (
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>{payment.note}</Text>
      )}
    </View>
  );
}