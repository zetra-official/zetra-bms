import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../src/supabase/supabaseClient";
import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Screen } from "../src/ui/Screen";
import { UI } from "../src/ui/theme";

function clean(x: any) {
  return String(x ?? "").trim();
}

export default function StoreProfileScreen() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [storeDisplayName, setStoreDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [mapLink, setMapLink] = useState("");

  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [mobileMoneyName, setMobileMoneyName] = useState("");
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const id = clean(storeId);
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("store_profiles")
          .select("*")
          .eq("store_id", id)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;

        setStoreDisplayName(clean(data?.store_display_name));
        setPhone(clean(data?.phone));
        setWhatsapp(clean(data?.whatsapp));
        setEmail(clean(data?.email));
        setRegion(clean(data?.region));
        setCity(clean(data?.city));
        setAddress(clean(data?.address));
        setMapLink(clean(data?.map_link));
        setBankName(clean(data?.bank_name));
        setAccountName(clean(data?.account_name));
        setAccountNumber(clean(data?.account_number));
        setMobileMoneyName(clean(data?.mobile_money_name));
        setMobileMoneyNumber(clean(data?.mobile_money_number));
        setPaymentInstructions(clean(data?.payment_instructions));
      } catch (e: any) {
        Alert.alert("Failed", clean(e?.message) || "Failed to load store profile");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [storeId]);

  const onSave = async () => {
    const id = clean(storeId);
    if (!id) {
      Alert.alert("Missing store", "Store haijapatikana.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("store_profiles").upsert({
        store_id: id,
        store_display_name: clean(storeDisplayName),
        phone: clean(phone),
        whatsapp: clean(whatsapp),
        email: clean(email),
        region: clean(region),
        city: clean(city),
        address: clean(address),
        map_link: clean(mapLink),
        bank_name: clean(bankName),
        account_name: clean(accountName),
        account_number: clean(accountNumber),
        mobile_money_name: clean(mobileMoneyName),
        mobile_money_number: clean(mobileMoneyNumber),
        payment_instructions: clean(paymentInstructions),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      Alert.alert("Saved ✅", "Taarifa za store zimehifadhiwa.", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", clean(e?.message) || "Failed to save store profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
                Store Profile
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
                Taarifa za tawi/store zitakazoonekana kwenye invoice na receipt.
              </Text>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: UI.border,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "900" }}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <Card>
              <ActivityIndicator />
            </Card>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 190 }}
            >
              <Card style={{ gap: 14 }}>
                <SectionTitle title="Store Details" subtitle="Jaza taarifa za msingi za store/tawi hili." />

                <Input label="Jina la store kwenye receipt" helper="Mfano: JOFU QUALITY SOWETO au Kariakoo Branch." value={storeDisplayName} onChangeText={setStoreDisplayName} />
                <Input label="Namba ya simu" helper="Namba ya mawasiliano ya store hii. Mfano: 0755 000 000." value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Input label="Namba ya WhatsApp" helper="Weka kama ni tofauti na namba ya kawaida. Inaweza kutumika kwenye receipt." value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" />
                <Input label="Email ya store" helper="Si lazima. Weka kama store hii ina email yake." value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

                <SectionTitle title="Location" subtitle="Mahali store/tawi hili lilipo." />

                <Input label="Mkoa" helper="Mfano: Mbeya, Dar es Salaam, Arusha." value={region} onChangeText={setRegion} />
                <Input label="Mji / Eneo" helper="Mfano: Soweto, Kariakoo, Mbezi, Mwanjelwa." value={city} onChangeText={setCity} />
                <Input label="Anwani kamili" helper="Andika eneo kwa kueleweka. Mfano: Soweto karibu na stand ya daladala." value={address} onChangeText={setAddress} multiline />
                <Input label="Google Maps link" helper="Si lazima. Weka link ya location kutoka Google Maps kama ipo." value={mapLink} onChangeText={setMapLink} autoCapitalize="none" />

                <SectionTitle title="Payment Details" subtitle="Taarifa za malipo za store hii." />

                <Input label="Jina la benki" helper="Mfano: CRDB, NMB, NBC, Equity." value={bankName} onChangeText={setBankName} />
                <Input label="Jina la account" helper="Jina lililoandikwa kwenye account ya benki." value={accountName} onChangeText={setAccountName} />
                <Input label="Namba ya account" helper="Namba ya account ya benki ya store hii." value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
                <Input label="Mtandao wa malipo" helper="Mfano: M-Pesa, Tigo Pesa, Airtel Money, HaloPesa." value={mobileMoneyName} onChangeText={setMobileMoneyName} />
                <Input label="Lipa namba / Namba ya malipo" helper="Weka Lipa Namba, Till Number au namba ya kupokea malipo." value={mobileMoneyNumber} onChangeText={setMobileMoneyNumber} keyboardType="phone-pad" />
                <Input label="Maelekezo ya malipo" helper="Mfano: Tafadhali lipa kabla ya mzigo kutoka dukani." value={paymentInstructions} onChangeText={setPaymentInstructions} multiline />

                <Button
                  title={saving ? "Inahifadhi..." : "Hifadhi Store Profile"}
                  onPress={onSave}
                  disabled={saving}
                  variant="primary"
                />
              </Card>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>{title}</Text>
      <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 4, lineHeight: 19 }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Input({
  label,
  helper,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  helper: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={UI.faint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        multiline={!!multiline}
        style={{
          borderWidth: 1,
          borderColor: UI.border,
          borderRadius: 14,
          padding: 14,
          minHeight: multiline ? 86 : 52,
          color: UI.text,
          fontWeight: "800",
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      <Text style={{ color: UI.faint, fontWeight: "700", fontSize: 12, lineHeight: 17 }}>
        {helper}
      </Text>
    </View>
  );
}