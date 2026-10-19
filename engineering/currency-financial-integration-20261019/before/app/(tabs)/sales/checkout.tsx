import {saleAttemptKey,parseSaleAttempt,blocksSale,definitiveSaleRejection,type SaleAttempt} from '../../../src/pos/saleAttempt';
import {parseCheckoutCart,scopedCartKey,readCart,writeCart} from '../../../src/pos/cartLifecycle';
import {posStabilityText} from '../../../src/i18n/posStability';
import {getExtraPerQty,getAdjustedUnitPrice,getAdjustedLineTotal,parseAdjustment,applyItemAdjustment,plainPriceAmount} from '../../../src/pos/itemAdjustment';
import {priceAdjustmentText} from '../../../src/i18n/priceAdjustment';
import {conversionService,canonicalJson,parseConversionQuote,type ConversionQuote} from '../../../src/proforma/conversion';
import {conversionText} from '../../../src/proforma/conversionCopy';
import {useLanguage} from '../../../src/i18n/LanguageProvider';
import {paymentMethodKey} from "@/src/i18n/presentation";
import {useSystemMessageText} from "@/src/i18n/useSystemMessageText";
﻿import {useCommonText} from "@/src/i18n/useCommonText";
import SafeIcon from "@/src/ui/SafeIcon";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useOrg } from "../../../src/context/OrgContext";
import { enqueueSale, makeId } from "../../../src/offline/salesQueue";
import { SubmissionGate } from "../../../src/offline/submissionGate";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "../../../src/ui/theme";
import { CheckoutProformaAction } from "../../../src/proforma/CheckoutProformaAction";
import { takeCompletedDraft, cartSignature } from "../../../src/proforma/savedCart";
import { stageProformaCart } from "../../../src/proforma/checkoutDraft";

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  line_total: number;

  // Checkout-only signed per-unit adjustment; catalog price remains unchanged.
  extra_per_qty?: number;
};

type PayMethod = "CASH" | "MOBILE" | "BANK" | "CREDIT";
type CheckoutMethod = PayMethod | "SPLIT";

type DiscountType = "fixed" | "percent" | null;
type DiscountResult = { type: DiscountType; value: number; amount: number };

type OpenCashierShiftRow = {
  shift_id: string;
  organization_id?: string | null;
  store_id?: string | null;
  membership_id?: string | null;
  opening_cash?: number | null;
  status?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
};
async function playSaleSuccessSoundSafe() {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      const Context = window.AudioContext || (window as any).webkitAudioContext;
      if (!Context) return;
      const context = new Context();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.setValueAtTime(880, context.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { void context.close(); };
      oscillator.start(); oscillator.stop(context.currentTime + 0.2);
      return;
    }

    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      require("../../../assets/sounds/sale-success.wav"),
      {
        shouldPlay: true,
        volume: 0.46,
      }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;

      if (status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch {
    // Success sound must never break checkout.
  }
}
type StaffAttributionStoreRow = {
  store_id: string;
  store_name: string;
};

type StaffAttributionRow = {
  user_id: string;
  membership_id: string;
  role?: string | null;
  email?: string | null;
  user_email?: string | null;
  stores?: StaffAttributionStoreRow[];
};

type CheckoutCustomerSuggestion = {
  id: string;
  full_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function parseMoney(s: string) {
  const cleaned = String(s ?? "").replace(/[, ]+/g, "").trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseDiscountInput(input: string, total: number): DiscountResult {
  const t = String(input ?? "").toLowerCase().trim();
  if (!t || total <= 0) return { type: null, value: 0, amount: 0 };

  const pctMatch = t.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pctMatch?.[1]) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct));
      const amt = Math.min(total, Math.round((total * clampedPct) / 100));
      return { type: "percent", value: clampedPct, amount: Math.max(0, amt) };
    }
  }

  const compact = t.replace(/\s+/g, "");
  const m = compact.match(/^(-?[0-9][0-9,]*(?:\.[0-9]+)?)([km])?$/i);
  const rawNum = m?.[1] ?? compact.match(/-?[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0] ?? "";
  if (!rawNum) return { type: null, value: 0, amount: 0 };

  const suffix = (m?.[2] ?? compact.match(/[km]\b/i)?.[0] ?? "").toLowerCase();
  const cleaned = rawNum.replace(/,/g, "");
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return { type: null, value: 0, amount: 0 };
  n = Math.abs(n);

  const mult = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const fixedValue = n * mult;

  const amount = Math.max(0, Math.min(total, Math.round(fixedValue)));
  return { type: "fixed", value: fixedValue, amount };
}

function buildNoteWithDiscount(args: {
  note: string;
  discountText: string;
  discountAmount: number;
  subtotal: number;
}) {
  const base = String(args.note ?? "").trim();
  const dText = String(args.discountText ?? "").trim();
  const dAmt = Math.max(0, Number(args.discountAmount || 0));
  const sub = Math.max(0, Number(args.subtotal || 0));

  if (!dText && dAmt <= 0) return (base || null) as any;

  const tag = `DISCOUNT: "${dText || "—"}" | DISCOUNT_AMOUNT: ${plainPriceAmount(dAmt)} | SUBTOTAL: ${plainPriceAmount(sub)}`;
  if (!base) return tag as any;

  return `${base}\n${tag}` as any;
}

function MethodChip({
  label,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flex: compact ? undefined : 1,
        width: compact ? ("48.7%" as any) : undefined,
        minHeight: compact ? 44 : 48,
        paddingVertical: compact ? 8 : 10,
        paddingHorizontal: 4,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? "rgba(52,211,153,0.40)" : theme.colors.border,
        backgroundColor: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        allowFontScaling={false}
        style={{
          color: active ? theme.colors.emerald : theme.colors.text,
          fontWeight: "900",
          fontSize: compact ? 13 : 14,
          textAlign: "center",
          includeFontPadding: false,
          width: "100%",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function normalizeMoneyInput(raw: string, conversion = false) {
  if(conversion)return String(raw??'').replace(/[, ]+/g,'').trim();
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  const stripped = digitsOnly.replace(/^0+(?=\d)/, "");
  return stripped;
}

function isCheckoutMethod(x: any): x is CheckoutMethod {
  return x === "CASH" || x === "BANK" || x === "MOBILE" || x === "CREDIT" || x === "SPLIT";
}

function parseWholeNumberInput(raw: string) {
  const cleaned = String(raw ?? "").replace(/[^\d]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

async function getMyOpenCashierShiftId(storeId: string): Promise<string | null> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return null;

  const { data, error } = await supabase.rpc("get_my_open_cashier_shift_v1", {
    p_store_id: sid,
  } as any);

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as OpenCashierShiftRow | null;
  const shiftId = String(row?.shift_id ?? "").trim();
  return shiftId || null;
}

function FieldLabel({ children }: { children: any }) {
  return <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>{children}</Text>;
}

function pickStaffEmail(r?: StaffAttributionRow | null) {
  if (!r) return null;
  return String(r.email ?? r.user_email ?? "").trim() || null;
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(15,23,42,0.36)"
      keyboardType={props.keyboardType}
      multiline={props.multiline}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.10)",
        backgroundColor: "rgba(255,255,255,0.78)",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: props.multiline ? 10 : 9,
        minHeight: props.multiline ? 66 : undefined,
      }}
    />
  );
}

function CheckoutMiniTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        flexBasis: 140,
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: highlight ? "rgba(52,211,153,0.24)" : "rgba(15,23,42,0.08)",
        backgroundColor: highlight ? "rgba(52,211,153,0.09)" : "rgba(255,255,255,0.58)",
      }}
    >
      <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 11 }}>
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? theme.colors.emerald : theme.colors.text,
          fontWeight: "900",
          marginTop: 3,
          fontSize: 13,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function checkoutCardStyle(accent: string, bg: string = "#FFFFFF", compact = false) {
  return {
    gap: compact ? 7 : 12,
    padding: compact ? 10 : undefined,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderLeftColor: accent,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: bg,
    shadowColor: "#0F172A",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  };
}
export default function CheckoutScreen() {
 const systemText=useSystemMessageText();
 const uiText=useCommonText();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const params = useLocalSearchParams<{
    storeId?: string | string[];
    storeName?: string | string[];
    proformaId?:string;proformaOrg?:string;proformaQuote?:string;cartId?:string;cartOrg?:string;cartActor?:string;
    cart?: string | string[];
    cashierMode?: string | string[];
reservationMode?: string | string[];
orderMode?: string | string[];
orderType?: string | string[];
orderOrgId?: string | string[];
orderStoreId?: string | string[];
orderStoreName?: string | string[];
  }>();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const orgCtx: any = useOrg();
  const {
    activeOrgId,
    activeStoreId,
    activeStoreName,
    activeRole,
    activeMembershipId,
  } = orgCtx;

  const orgId = String(activeOrgId ?? "").trim();
  const money = useOrgMoneyPrefs(orgId);
  const {language:conversionLanguage}=useLanguage();
  const conversionId=String(one(params.proformaId)??'');
  const conversionQuote=useMemo<ConversionQuote|null>(()=>{return parseConversionQuote(String(one(params.proformaQuote)??''),conversionId)},[params.proformaQuote,conversionId]);
  const [conversionChecked,setConversionChecked]=useState(false);
  const conversionAttempt=useRef<{request:string;quote:ConversionQuote;payment:Record<string,unknown>}|null>(null);
  const displayCurrency = conversionQuote?.currency || money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmt = useCallback(
    (n: number) =>
      (Number.isInteger(n)?formatMoney(n, { currency: displayCurrency, locale: displayLocale }):new Intl.NumberFormat(displayLocale,{style:"currency",currency:displayCurrency,minimumFractionDigits:0,maximumFractionDigits:12}).format(n)).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const storeId = String(one(params.storeId) ?? "").trim();

  const [cartActor,setCartActor]=useState('');
  useEffect(()=>{let live=true;void supabase.auth.getSession().then(({data:{session}})=>{if(live)setCartActor(session?.user.id??'')});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{if(live)setCartActor(session?.user.id??'')});return()=>{live=false;subscription.unsubscribe()}},[]);
  const clearPersistedSalesCart = useCallback(async () => {
    const sid = String(storeId ?? "").trim();
    if (!sid) return;

    if(!cartActor||!orgId)throw Error('CART_SCOPE_REQUIRED');
    await writeCart(AsyncStorage,scopedCartKey({organizationId:orgId,storeId:sid,actorId:cartActor}),[]);
  }, [storeId,orgId,cartActor]);
  const conversionApi=useMemo(()=>conversionService(supabase,orgId,storeId),[orgId,storeId]);
  useEffect(()=>{let live=true;setConversionChecked(false);if(conversionId&&conversionQuote&&String(one(params.proformaOrg))===orgId)void conversionApi.preview(conversionId).then(p=>{if(!live)return;if(p.converted&&p.saleId){router.replace({pathname:'/sales/receipt',params:{saleId:p.saleId}} as any);return}setConversionChecked(canonicalJson(p.quote)===canonicalJson(conversionQuote))}).catch(()=>{});return()=>{live=false}},[conversionApi,conversionId,conversionQuote,params.proformaOrg,orgId,router]);
  const storeNameParam = String(one(params.storeName) ?? "").trim();
  const cashierMode = one(params.cashierMode) === "1";
const reservationMode =
  one(params.reservationMode) === "1" || one(params.orderMode) === "1";

const reservationOrderType =
  String(one(params.orderType) ?? "RESERVATION").trim().toUpperCase() === "PRE_ORDER"
    ? "PRE_ORDER"
    : "RESERVATION";

const reservationOrgId = String(one(params.orderOrgId) ?? orgId).trim();

  const cart: CartItem[] = useMemo(()=>parseCheckoutCart(one(params.cart)) as CartItem[],[params.cart]);
  const normalizedCart = useMemo(() => cart.map(c => ({
    ...c, extra_per_qty: Number(c.extra_per_qty ?? 0) || 0,
  })), [cart]);
  const [checkoutCart, setCheckoutCart] = useState<CartItem[]>(() => normalizedCart);
  const cartSource = useRef(normalizedCart);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustTargetIndex, setAdjustTargetIndex] = useState<number | null>(null);
  const [adjustApplyToAll, setAdjustApplyToAll] = useState(false);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustDirection,setAdjustDirection]=useState<1|-1>(1);
  const adjustmentText=(key:Parameters<typeof priceAdjustmentText>[1])=>priceAdjustmentText(conversionLanguage,key);

  const cartHydration=useRef({scope:'',source:'',epoch:0});
  const cartScopeMismatch=!!(one(params.cartOrg)&&one(params.cartOrg)!==orgId)||!!(one(params.cartActor)&&cartActor&&one(params.cartActor)!==cartActor);
  useEffect(()=>{
    if(!orgId||!storeId||!cartActor)return;
    const scope=scopedCartKey({organizationId:orgId,storeId,actorId:cartActor}),raw=one(params.cart),source=String(one(params.cartId)??'')+'|'+String(raw??'');
    const hydration=cartHydration.current,epoch=++hydration.epoch;
    if(hydration.scope!==scope){hydration.scope=scope;hydration.source='';setCheckoutCart([])}
    if(cartScopeMismatch){setCheckoutCart([]);return}
    if(raw){if(source!==hydration.source){hydration.source=source;cartSource.current=normalizedCart;setCheckoutCart(normalizedCart)}return}
    // A transient missing param must not erase a valid in-memory cart.
    if(hydration.source||conversionId)return;
    void readCart(AsyncStorage,scope).then(rows=>{
      if(hydration.epoch!==epoch||hydration.scope!==scope)return;
      const valid=parseCheckoutCart(JSON.stringify(rows));if(valid.length!==rows.length)return;
      if(valid.length){hydration.source='recovered';setCheckoutCart(valid as CartItem[])}
    }).catch(()=>{});
    return()=>{hydration.epoch++};
  },[orgId,storeId,cartActor,params.cart,params.cartId,cartScopeMismatch,normalizedCart,conversionId]);

  const isDesktopWeb = Platform.OS === "web" && width >= 1180;
  

  const desktopShellWidth = useMemo(() => {
    if (!isDesktopWeb) return 0;
    if (width >= 1700) return 1540;
    if (width >= 1500) return 1440;
    if (width >= 1360) return 1300;
    return 1180;
  }, [isDesktopWeb, width]);

  const desktopSummaryWidth = useMemo(() => {
    if (!isDesktopWeb) return 0;
    if (width >= 1500) return 430;
    if (width >= 1360) return 400;
    return 370;
  }, [isDesktopWeb, width]);

  const desktopMainWidth = useMemo(() => {
    if (!isDesktopWeb) return 0;
    return Math.max(0, desktopShellWidth - desktopSummaryWidth - 20);
  }, [isDesktopWeb, desktopShellWidth, desktopSummaryWidth]);

  const canSell = useMemo(() => {
    const r = String(activeRole ?? "staff").trim().toLowerCase();
    return r === "owner" || r === "admin" || r === "staff" || r === "cashier";
  }, [activeRole]);

  const canAdjustPrice=canSell&&['owner','admin','staff','cashier'].includes(String(activeRole??'').toLowerCase())&&orgCtx.activeStoreType==='STANDARD'&&storeId===activeStoreId&&!conversionId&&!cashierMode&&!reservationMode;

  const openAdjustModal = useCallback((index: number) => {
    const row = checkoutCart[index];
    if (!row || !canAdjustPrice) return;
    setAdjustTargetIndex(index);
    setAdjustApplyToAll(false);
    setAdjustDirection(getExtraPerQty(row)<0?-1:1);
    setAdjustValue(String(Math.abs(getExtraPerQty(row)) || ""));
    setAdjustModalVisible(true);
  }, [checkoutCart,canAdjustPrice]);

  const closeAdjustModal = useCallback(() => {
    setAdjustModalVisible(false);
    setAdjustTargetIndex(null);
    setAdjustApplyToAll(false);
    setAdjustValue("");
  }, []);

  const applyAdjustment = useCallback(() => {
    if(!canAdjustPrice){Alert.alert(uiText("Adjust Price"),priceAdjustmentText(conversionLanguage,'locked'));return;}
    try {
      const delta=parseAdjustment(adjustValue,adjustDirection);
      const next=applyItemAdjustment(checkoutCart,adjustTargetIndex??-1,adjustApplyToAll,delta);
      setCheckoutCart(next);closeAdjustModal();
    } catch {Alert.alert(uiText("Adjust Price"),priceAdjustmentText(conversionLanguage,'invalid'));}
  },[canAdjustPrice,checkoutCart,adjustValue,adjustDirection,adjustTargetIndex,adjustApplyToAll,closeAdjustModal,uiText,conversionLanguage]);

  const totalQty = useMemo(
    () => checkoutCart.reduce((a, c) => a + (c.qty || 0), 0),
    [checkoutCart]
  );

  const subtotalAmount = useMemo(
    () => checkoutCart.reduce((a, c) => a + getAdjustedLineTotal(c), 0),
    [checkoutCart]
  );

  const [discountText, setDiscountText] = useState<string>(()=>conversionQuote?conversionQuote.discountValue+(conversionQuote.discountType==='percent'?'%':''):"");
  const discount = useMemo(
    () => parseDiscountInput(discountText, subtotalAmount),
    [discountText, subtotalAmount]
  );

  const grandTotal = useMemo(
    () => Math.max(0, subtotalAmount - (discount.amount || 0)),
    [subtotalAmount, discount.amount]
  );

  const headerStoreName = storeNameParam || activeStoreName || "—";
  // Preserve decimals only where the canonical cart carries fractional unit prices.
  const preservePricePrecision=!!conversionId||checkoutCart.some(item=>!Number.isInteger(getAdjustedUnitPrice(item)));

  const mismatch = !!(activeStoreId && storeId && activeStoreId !== storeId);

  const [method, setMethod] = useState<CheckoutMethod>(() =>
    reservationMode ? "CREDIT" : "CASH"
  );
  const [paidVia, setPaidVia] = useState<Exclude<PayMethod, "CREDIT">>("CASH");

  const [paidStr, setPaidStr] = useState<string>(() =>
    reservationMode ? "0" : String(preservePricePrecision?(grandTotal||subtotalAmount):Math.round(grandTotal || subtotalAmount))
  );

  const [splitCashStr, setSplitCashStr] = useState<string>("");
  const [splitMobileStr, setSplitMobileStr] = useState<string>("");
  const [splitBankStr, setSplitBankStr] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [reference, setReference] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>(()=>conversionQuote?.customer?.name??"");
  const [customerPhone, setCustomerPhone] = useState<string>(()=>conversionQuote?.customer?.phone??"");
  const [customerOptions, setCustomerOptions] = useState<CheckoutCustomerSuggestion[]>([]);
  const [customerSuggestionsOpen, setCustomerSuggestionsOpen] = useState(false);
  const [customerSearchFocused, setCustomerSearchFocused] = useState<"name" | "phone" | null>(null);

 const [staffOptions, setStaffOptions] = useState<StaffAttributionRow[]>([]);
const [myStaffMembershipId, setMyStaffMembershipId] = useState<string>("");
const [currentActorMembershipId, setCurrentActorMembershipId] = useState<string>("");
const [soldByMembershipId, setSoldByMembershipId] = useState<string>("");
const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);
  const [note, setNote] = useState("");
  const proformaDraftRef=useRef<string|null>(null);
  useFocusEffect(useCallback(()=>{if(proformaDraftRef.current&&takeCompletedDraft(proformaDraftRef.current)){proformaDraftRef.current=null;setCheckoutCart([]);setCustomerName('');setCustomerPhone('');setDiscountText('');setNote('')}},[]));
  const [saving, setSaving] = useState(false);
  const submission = useRef(new SubmissionGate());
  const [attemptReady,setAttemptReady]=useState(false);
  const [attemptRecovery,setAttemptRecovery]=useState<SaleAttempt|null>(null);
  const saleIntent=String(one(params.cartId)??one(params.cart)??'');
  useEffect(()=>{let live=true;setAttemptReady(false);setAttemptRecovery(null);
    if(conversionId||cashierMode||reservationMode){setAttemptReady(true);return}
    if(!orgId||!storeId||!cartActor)return;
    const key=saleAttemptKey({organizationId:orgId,storeId,actorId:cartActor});
    void AsyncStorage.getItem(key).then(raw=>{const a=parseSaleAttempt(raw);if(live){setAttemptRecovery(blocksSale(a,saleIntent)?a:null);setAttemptReady(true)}}).catch(()=>{if(live)setWebBanner({type:'error',text:posStabilityText(conversionLanguage,'unresolved')})});
    return()=>{live=false};
  },[orgId,storeId,cartActor,saleIntent,conversionId,cashierMode,reservationMode]);
  const rememberAttempt=useCallback(async(attempt:SaleAttempt)=>{
    if(!orgId||!cartActor||!storeId)throw Error('CART_SCOPE_REQUIRED');
    await AsyncStorage.setItem(saleAttemptKey({organizationId:orgId,storeId,actorId:cartActor}),JSON.stringify(attempt));
    setAttemptRecovery(attempt);
  },[orgId,storeId,cartActor]);
  const reviewSale=useCallback(async()=>{
    if(!attemptRecovery)return;
    const {data,error}=await supabase.from('sales').select('id').eq('store_id',storeId).eq('client_sale_id',attemptRecovery.id).maybeSingle();
    if(error||!data?.id)return;
    if(!attemptRecovery.requiresFollowUp)await rememberAttempt({...attemptRecovery,phase:'COMPLETE',saleId:String(data.id)});
    router.push({pathname:'/sales/receipt',params:{saleId:String(data.id)}} as any);
  },[attemptRecovery,storeId,rememberAttempt,router]);

  const [openCashierShiftId, setOpenCashierShiftId] = useState<string | null>(null);
  const [webBanner, setWebBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const hydratedConversionRef=useRef('');
  useEffect(()=>{
    if(!conversionId){if(hydratedConversionRef.current){hydratedConversionRef.current='';conversionAttempt.current=null;submission.current=new SubmissionGate();setCustomerName('');setCustomerPhone('');setDiscountText('');setNote('');setPaidStr('');setMethod('CASH');setSplitCashStr('');setSplitMobileStr('');setSplitBankStr('');setChannel('');setReference('')}return}
    if(!conversionQuote)return;
    const identity=conversionId+canonicalJson(conversionQuote);
    if(hydratedConversionRef.current===identity)return;
    hydratedConversionRef.current=identity;
    conversionAttempt.current=null;submission.current=new SubmissionGate();
    setCustomerName(conversionQuote.customer?.name??'');setCustomerPhone(conversionQuote.customer?.phone??'');
    setDiscountText(conversionQuote.discountValue+(conversionQuote.discountType==='percent'?'%':''));
    setMethod('CASH');setPaidVia('CASH');setPaidStr(conversionQuote.total);
    setSplitCashStr('');setSplitMobileStr('');setSplitBankStr('');setChannel('');setReference('');setNote('');
  },[conversionId,conversionQuote]);

  const onPaidChange = useCallback((t: string) => {
    setPaidStr(normalizeMoneyInput(t,preservePricePrecision));
  }, [preservePricePrecision]);

  const onSetMethod = useCallback(
    (m: CheckoutMethod) => {
      if (!isCheckoutMethod(m)) return;
      setMethod(m);

      if (m === "CREDIT") {
        setPaidStr("0");
        setSplitCashStr("");
        setSplitMobileStr("");
        setSplitBankStr("");
        setPaidVia("CASH");
        setChannel("");
        setReference("");
        return;
      }

      if (m === "SPLIT") {
        setPaidStr("0");
        setSplitCashStr("");
        setSplitMobileStr("");
        setSplitBankStr("");
        setPaidVia("CASH");
        if (!channel) setChannel("M-PESA");
        return;
      }

      setPaidStr(String(preservePricePrecision?grandTotal:Math.round(grandTotal)));
      setPaidVia("CASH");

      if (m === "CASH") {
        setChannel("");
        setReference("");
      }

      if (m === "MOBILE") {
        if (!channel) setChannel("M-PESA");
      }
    },
    [grandTotal, channel, preservePricePrecision]
  );

  const splitCashAmount = useMemo(() => parseMoney(splitCashStr), [splitCashStr]);
  const splitMobileAmount = useMemo(() => parseMoney(splitMobileStr), [splitMobileStr]);
  const splitBankAmount = useMemo(() => parseMoney(splitBankStr), [splitBankStr]);

  const splitTotalPaid = useMemo(() => {
    const cash = Number.isFinite(splitCashAmount) ? splitCashAmount : 0;
    const mobile = Number.isFinite(splitMobileAmount) ? splitMobileAmount : 0;
    const bank = Number.isFinite(splitBankAmount) ? splitBankAmount : 0;
    return Math.max(0, cash) + Math.max(0, mobile) + Math.max(0, bank);
  }, [splitCashAmount, splitMobileAmount, splitBankAmount]);

  const paidAmount = useMemo(() => {
    if (method === "SPLIT") return splitTotalPaid;
    return parseMoney(paidStr);
  }, [method, paidStr, splitTotalPaid]);

  const balance = useMemo(() => {
    const p = Number.isFinite(paidAmount) ? paidAmount : 0;
    return Math.max(0, grandTotal - Math.max(0, p));
  }, [paidAmount, grandTotal]);

  const isCredit = useMemo(() => method === "CREDIT", [method]);
  const isSplit = useMemo(() => method === "SPLIT", [method]);

  const showPaidVia = useMemo(
    () => method === "CREDIT" && (Number.isFinite(paidAmount) ? paidAmount : 0) > 0,
    [method, paidAmount]
  );
useEffect(() => {
    let alive = true;

    async function loadCheckoutCustomers() {
      try {
      if (!storeId) {
  if (alive) setCustomerOptions([]);
  return;
}

        const { data, error } = await supabase
          .from("customers")
          .select("id, full_name, phone, normalized_phone")
          .eq("store_id", storeId)
          .order("updated_at", { ascending: false })
          .limit(300);

        if (error) throw error;

        if (alive) {
          setCustomerOptions((data ?? []) as CheckoutCustomerSuggestion[]);
        }
      } catch {
        if (alive) setCustomerOptions([]);
      }
    }

    void loadCheckoutCustomers();

    return () => {
      alive = false;
    };
  }, [storeId]);
  const rpcPaymentMethod: PayMethod = useMemo(() => {
    if (method === "SPLIT") {
      return "CASH";
    }

    if (method !== "CREDIT") return method;

    const p = Number.isFinite(paidAmount) ? paidAmount : 0;
    if (p > 0) return paidVia;
    return "CREDIT";
  }, [method, paidAmount, paidVia]);

  const rpcChannel = useMemo(() => {
    if (rpcPaymentMethod === "MOBILE") return channel.trim() || "M-PESA";
    if (rpcPaymentMethod === "BANK") return channel.trim();
    return "";
  }, [rpcPaymentMethod, channel]);

  const rpcReference = useMemo(() => {
    if (rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK") return reference.trim();
    return "";
  }, [rpcPaymentMethod, reference]);

  useEffect(() => {
    let alive = true;

    async function loadStaffAttributionOptions() {
      try {
if (!orgId || !storeId) {
  if (alive) {
    setStaffOptions([]);
    setMyStaffMembershipId("");
    setCurrentActorMembershipId("");
    setSoldByMembershipId("");
  }
  return;
}

        const [{ data: authData }, rpcRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("get_org_staff_with_stores", { p_org_id: orgId }),
        ]);

        if (rpcRes.error) throw rpcRes.error;

        const authUserId = String(authData?.user?.id ?? "").trim();

        const role = String(activeRole ?? "").trim().toLowerCase();

        const allStaffRows = ((rpcRes.data ?? []) as StaffAttributionRow[]).filter(
          (r) => String(r.role ?? "").toLowerCase() === "staff"
        );

        const nextRows =
          role === "owner" || role === "admin"
            ? allStaffRows
            : allStaffRows.filter((r) => {
                const stores = Array.isArray(r.stores) ? r.stores : [];
                return stores.some((s) => String(s.store_id ?? "") === storeId);
              });

        const myRow = nextRows.find((r) => String(r.user_id ?? "") === authUserId);
        const myMembership = String(myRow?.membership_id ?? "").trim();

        let currentMembership = String(activeMembershipId ?? "").trim();

        if (!currentMembership && authUserId) {
          const ownMembershipRes = await supabase
            .from("org_memberships")
            .select("id")
            .eq("organization_id", orgId)
            .eq("user_id", authUserId)
            .maybeSingle();

          if (ownMembershipRes.error) throw ownMembershipRes.error;
          currentMembership = String(ownMembershipRes.data?.id ?? "").trim();
        }

        if (!alive) return;

        setStaffOptions(nextRows);
        setMyStaffMembershipId(myMembership);
        setCurrentActorMembershipId(currentMembership);

        if (role === "staff") {
          setSoldByMembershipId((prev) => prev || myMembership || currentMembership || "");
        }
      } catch {
        if (!alive) return;
        setStaffOptions([]);
        setMyStaffMembershipId("");
        setCurrentActorMembershipId("");
      }
    }

    void loadStaffAttributionOptions();

    async function loadMyOpenCashierShift() {
      try {
        if (!storeId) {
          if (alive) setOpenCashierShiftId(null);
          return;
        }

        const role = String(activeRole ?? "").trim().toLowerCase();
        if (role !== "cashier") {
          if (alive) setOpenCashierShiftId(null);
          return;
        }

        const { data, error } = await supabase.rpc("get_my_open_cashier_shift_v1", {
          p_store_id: storeId,
        } as any);

        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as OpenCashierShiftRow | null;
        const shiftId = String(row?.shift_id ?? "").trim();

        if (alive) setOpenCashierShiftId(shiftId || null);
      } catch {
        if (alive) setOpenCashierShiftId(null);
      }
    }

    void loadMyOpenCashierShift();

    return () => {
      alive = false;
    };
  }, [storeId, activeRole, activeMembershipId, orgId]);

  useEffect(() => {
    if (cashierMode) return;

    const gt = preservePricePrecision?grandTotal:Math.round(grandTotal);
    const current = parseMoney(paidStr);

    if (!Number.isFinite(current)) {
      setPaidStr(isCredit ? "0" : String(gt));
      return;
    }

    if (!isCredit) {
      if (current !== gt) setPaidStr(String(gt));
      return;
    }

    if (current < 0) setPaidStr("0");
    if (current > gt) setPaidStr(String(gt));
  }, [cashierMode, grandTotal, paidStr, isCredit,preservePricePrecision]);

  const effectiveSoldByMembershipId = useMemo(() => {
    const role = String(activeRole ?? "").trim().toLowerCase();

    if (role === "staff") {
      return soldByMembershipId || myStaffMembershipId || currentActorMembershipId || "";
    }

    return soldByMembershipId || "";
  }, [activeRole, soldByMembershipId, myStaffMembershipId, currentActorMembershipId]);

  const selectedSoldByLabel = useMemo(() => {
    if (!effectiveSoldByMembershipId) return "No staff selected";

    const found = staffOptions.find(
      (r) => String(r.membership_id ?? "") === String(effectiveSoldByMembershipId ?? "")
    );

    return pickStaffEmail(found) ?? "Selected staff";
  }, [staffOptions, effectiveSoldByMembershipId]);

  const customerQuery = useMemo(() => {
    const byName = String(customerName ?? "").trim().toLowerCase();
    const byPhone = String(customerPhone ?? "").trim().toLowerCase();

    if (customerSearchFocused === "phone") return byPhone;
    return byName || byPhone;
  }, [customerName, customerPhone, customerSearchFocused]);

  const filteredCustomerOptions = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    return customerOptions
      .filter((c: CheckoutCustomerSuggestion) => {
        const name = String(c.full_name ?? "").toLowerCase();
        const phone = String(c.phone ?? "").toLowerCase();
        const normalized = String(c.normalized_phone ?? "").toLowerCase();

        return name.includes(q) || phone.includes(q) || normalized.includes(q);
      })
      .slice(0, 8);
  }, [customerOptions, customerQuery]);

  const selectCheckoutCustomer = useCallback((c: CheckoutCustomerSuggestion) => {
    setCustomerName(String(c.full_name ?? "").trim());
    setCustomerPhone(String(c.phone ?? c.normalized_phone ?? "").trim());
    setCustomerSuggestionsOpen(false);
    setCustomerSearchFocused(null);
  }, []);

  const invalidReason = useMemo(() => {
    if(conversionId&&(!conversionChecked||!isOnline||!conversionQuote||cashierMode||reservationMode))return conversionText(conversionLanguage,'stale');
    if(cartScopeMismatch||!cartActor)return posStabilityText(conversionLanguage,'loading');
    if (!canSell) return "No permission to sell.";
    if (!storeId) return "Missing storeId.";
    if (mismatch) {
      return "Store mismatch: rudi nyuma, chagua store sahihi kisha uende Checkout upya.";
    }
    if (checkoutCart.length === 0) return "Cart is empty.";
    if (checkoutCart.some((c) => !Number.isFinite(getAdjustedUnitPrice(c)) || getAdjustedUnitPrice(c) <= 0)) {
      return "Some items are missing price.";
    }

    if (String(activeRole ?? "").trim().toLowerCase() === "cashier" && !cashierMode) {
      if (!openCashierShiftId) return "Cashier hana OPEN shift kwa store hii.";
    }

  if (cashierMode) {
  if (isOffline) return "Cashier handoff requires online connection.";
  return null;
}

if (reservationMode) {
  if (isOffline) return "Reservation/Pre Order requires online connection.";
  if (!customerName.trim()) return "Enter customer name for reservation/pre-order.";
  if (!Number.isFinite(paidAmount)) return "Enter a valid deposit/paid amount.";
  if (paidAmount < 0) return "Deposit cannot be negative.";
  if (paidAmount > grandTotal) return "Deposit cannot exceed total.";
  return null;
}
    

    if (!Number.isFinite(paidAmount)) return "Enter a valid paid amount.";
    if (paidAmount < 0) return "Paid amount cannot be negative.";
    if (paidAmount > grandTotal) return "Paid amount cannot exceed total.";

    if (!isCredit && (preservePricePrecision?Math.abs(paidAmount-grandTotal)>1e-9:Math.round(paidAmount) !== Math.round(grandTotal))) {
      return isSplit
        ? "Split payment total must equal full sale total."
        : "Non-credit sale must be fully paid.";
    }

    if (isSplit) {
      const cash = Number.isFinite(splitCashAmount) ? splitCashAmount : 0;
      const mobile = Number.isFinite(splitMobileAmount) ? splitMobileAmount : 0;
      const bank = Number.isFinite(splitBankAmount) ? splitBankAmount : 0;

      if (cash < 0 || mobile < 0 || bank < 0) return "Split payment cannot be negative.";
      if (cash <= 0 && mobile <= 0 && bank <= 0) return "Enter at least one split payment amount.";

      // Split payment details are saved inside note as:
      // SPLIT_PAYMENT: CASH=... | MOBILE=... | BANK=...
      // We do not require one channel/reference here because split can contain multiple channels.
    }

    if (showPaidVia) {
      if (!paidVia) return "Chagua Paid Via (Cash/Mobile/Bank).";
    }

    if (!isOffline && (rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK")) {
      if (!rpcChannel.trim()) {
        return rpcPaymentMethod === "MOBILE"
          ? "Select mobile channel (e.g. M-PESA)."
          : "Enter bank name/channel (e.g. NMB/CRDB).";
      }
      if (!rpcReference.trim()) {
        return "Enter reference/transaction id.";
      }
    }

    if (isCredit && !customerName.trim()) {
      return "Enter customer name (for credit/partial).";
    }

    return null;
  }, [
    conversionId,conversionChecked,conversionQuote,isOnline,reservationMode,conversionLanguage,canSell,
    storeId,
    mismatch,
    cartScopeMismatch,cartActor,
    checkoutCart,
    cashierMode,
    isOffline,
    paidAmount,
    preservePricePrecision,
    grandTotal,
    isCredit,
    showPaidVia,
    paidVia,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    customerName,
    activeRole,
    openCashierShiftId,
    effectiveSoldByMembershipId,
  isSplit,
splitCashAmount,
splitMobileAmount,
splitBankAmount,
reservationMode,
reservationOrderType,
orgId,
  ]);

  const preflightCheckStock = useCallback(async () => {
    const productIds = Array.from(new Set(checkoutCart.map((c) => c.product_id).filter(Boolean)));
    if (!storeId || productIds.length === 0) return;

    const { data, error } = await supabase
      .from("inventory")
      .select("product_id, qty")
      .eq("store_id", storeId)
      .in("product_id", productIds);

    if (error) return;

    const map = new Map<string, number>();
    (data ?? []).forEach((r: any) => map.set(String(r.product_id), Number(r.qty ?? 0)));

    const bad: { name: string; need: number; have: number }[] = [];
    for (const c of checkoutCart) {
      const have = map.has(c.product_id) ? Number(map.get(c.product_id)) : 0;
      const need = Number(Number(c.qty || 0).toFixed(3));
      if (need > 0 && have < need) bad.push({ name: c.name || "Product", need, have });
    }

    if (bad.length > 0) {
      const lines = bad
        .slice(0, 8)
        .map((x) => `• ${x.name}: have ${x.have}, need ${x.need}`)
        .join("\n");

      throw new Error(
        `Stock insufficient to complete this sale.\n\n${lines}\n\nPlease go to Inventory → Adjust Stock (ADD), then try again.`
      );
    }
  }, [checkoutCart, storeId]);

  const ensureCreditAccountV2 = useCallback(
    async (args: { storeId: string; customerName: string; customerPhone: string | null }) => {
      const payload = {
        p_store_id: args.storeId,
        p_customer_name: args.customerName,
        p_phone: args.customerPhone,
      };
      const res = await supabase.rpc("create_credit_account_v2", payload as any);
      if (res.error) throw res.error;

      const d: any = res.data;
      const id =
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? d?.[0]?.id ?? d?.[0]?.credit_account_id
            : d?.id ?? d?.credit_account_id;

      if (!id) throw new Error("create_credit_account_v2 did not return account id");
      return String(id);
    },
    []
  );

  const recordCreditSaleV2 = useCallback(
    async (args: {
      storeId: string;
      creditAccountId: string;
      amount: number;
      note?: string | null;
      reference?: string | null;
    }) => {
      const payload = {
        p_store_id: args.storeId,
        p_credit_account_id: args.creditAccountId,
        p_amount: args.amount,
        p_note: args.note ?? null,
        p_reference: args.reference ?? null,
      };
      const res = await supabase.rpc("record_credit_sale_v2", payload as any);
      if (res.error) throw res.error;
      return res.data;
    },
    []
  );

  const confirm = useCallback(async () => {
    if (saving || !attemptReady || attemptRecovery || !submission.current.begin()) return;
    setSaving(true);
    try {
    setWebBanner(null);

    if (invalidReason) {
      if (Platform.OS === "web") {
        setWebBanner({ type: "error", text: invalidReason });
      } else {
        Alert.alert(uiText("Blocked"), invalidReason);
      }
      return;
    }

    if(conversionId){
      try{
        if(!conversionQuote||!conversionChecked||!isOnline||String(one(params.proformaOrg))!==orgId)throw Error(conversionText(conversionLanguage,'stale'));
        const currentItems=checkoutCart.map(i=>({product_id:i.product_id,qty:i.qty,unit_price:getAdjustedUnitPrice(i)}));
        const quoteItems=conversionQuote.items.map(i=>({product_id:i.product_id,qty:i.qty,unit_price:i.unit_price}));
        if(canonicalJson(currentItems)!==canonicalJson(quoteItems)||customerName!==String(conversionQuote.customer?.name??'')||customerPhone!==String(conversionQuote.customer?.phone??'')||discount.type!==conversionQuote.discountType&&Number(conversionQuote.discountValue)!==0||Number(discount.value||0)!==Number(conversionQuote.discountValue))throw Error(conversionText(conversionLanguage,'checkout'));
        const cashierShift=String(activeRole).toLowerCase()==='cashier'?await getMyOpenCashierShiftId(storeId):null;
        const payment:Record<string,unknown>={method,paid:isSplit?conversionQuote.total:String(paidAmount),paidVia,channel:isSplit?channel.trim():rpcChannel,reference:isSplit?reference.trim():rpcReference,shiftId:cashierShift,soldByMembershipId:effectiveSoldByMembershipId||null};
        if(isSplit)Object.assign(payment,{cash:String(splitCashAmount),mobile:String(splitMobileAmount),bank:String(splitBankAmount)});
        if(conversionAttempt.current&&canonicalJson(conversionAttempt.current.payment)!==canonicalJson(payment))throw Error(conversionText(conversionLanguage,'stale'));
        conversionAttempt.current??={request:makeId(),quote:conversionQuote,payment};
        const attempt=conversionAttempt.current;
        const saleId=await conversionApi.commit(conversionId,attempt.request,attempt.quote,attempt.payment);
        submission.current.committed();
        // Conversion uses its own document cart; never clear an unrelated persisted POS cart.
        void playSaleSuccessSoundSafe();router.replace({pathname:'/(tabs)/sales/receipt',params:{saleId}} as any);
      }catch(e:any){
        if(e?.definitive)conversionAttempt.current=null;
        const message=e?.message??conversionText(conversionLanguage,'stale');
        if(Platform.OS==='web')setWebBanner({type:'error',text:message});else Alert.alert(uiText('Blocked'),message);
      }
      return;
    }
    if (cashierMode) {
      setSaving(true);
      try {
const handoffMetaLines =
  `HANDOFF_CUSTOMER_NAME: ${customerName.trim() || "-"}\n` +
  `HANDOFF_CUSTOMER_PHONE: ${customerPhone.trim() || "-"}\n` +
  `HANDOFF_SOLD_BY_MEMBERSHIP_ID: ${effectiveSoldByMembershipId || "-"}\n`;

const finalNote = buildNoteWithDiscount({
  note: `${handoffMetaLines}${note || ""}`,
  discountText,
  discountAmount: discount.amount,
  subtotal: subtotalAmount,
});

        const items = checkoutCart.map((c) => ({
          product_id: c.product_id,
         qty: Number(Number(c.qty).toFixed(3)),
          unit_price: getAdjustedUnitPrice(c),
          name: c.name ?? "Product",
          sku: c.sku ?? null,
          unit: c.unit ?? null,
          line_total: getAdjustedLineTotal(c),
        }));

submission.current.dispatched();
const { data, error } = await supabase.rpc("create_cashier_handoff_v2", {
  p_store_id: storeId,
  p_items: items,
  p_subtotal: subtotalAmount,
  p_discount_amount: discount.amount,
  p_total: grandTotal,
  p_note: finalNote,
  p_sold_by_membership_id: effectiveSoldByMembershipId || null,
  p_customer_name: customerName.trim() || null,
  p_customer_phone: customerPhone.trim() || null,
});

if (error) throw error;
submission.current.committed();
await clearPersistedSalesCart();

const successMsg = `Order imetumwa kwa cashier queue ya store hii. Handoff ID: ${String(data ?? "").slice(0, 8)}...`;

        if (Platform.OS === "web") {
          setWebBanner({ type: "success", text: successMsg });
          setTimeout(() => {
            router.replace("/(tabs)/sales" as any);
          }, 650);
        } else {
          Alert.alert(uiText("Sent to Cashiers ✅"), systemText(successMsg));
          router.replace("/(tabs)/sales" as any);
        }
      } catch (e: any) {
        const msg = submission.current.blocked
          ? "Order outcome requires review. Check cashier history before retrying."
          : e?.message ?? "Failed to send order to cashier queue";
        if (Platform.OS === "web") {
          setWebBanner({ type: "error", text: msg });
        } else {
          Alert.alert(uiText("Failed"), systemText(msg));
        }
      } finally {
        setSaving(false);
      }return;
    }

    if (reservationMode) {
  setSaving(true);
  try {
    await preflightCheckStock();

    const items = checkoutCart.map((c) => ({
      product_id: c.product_id,
      name: c.name ?? "Product",
      sku: c.sku ?? null,
      qty: Number(Number(c.qty).toFixed(3)),
      unit: c.unit ?? null,
      unit_price: getAdjustedUnitPrice(c),
      line_total: getAdjustedLineTotal(c),
    }));

    const productLabel = items
      .map((x) => `${x.name} x ${x.qty}`)
      .join(", ");

    const paymentLines =
      `ORDER_PAYMENT: METHOD=${rpcPaymentMethod} | PAID=${Number(paidAmount || 0)} | BALANCE=${Number(balance || 0)}\n` +
      `CHANNEL: ${rpcChannel || "-"} | REF: ${rpcReference || "-"}\n`;

    const finalNote = buildNoteWithDiscount({
      note: `${paymentLines}ITEMS_JSON: ${JSON.stringify(items)}\n${note || ""}`,
      discountText,
      discountAmount: discount.amount,
      subtotal: subtotalAmount,
    });

    submission.current.dispatched();
    const { error } = await supabase.rpc("create_store_order_v1", {
      p_org_id: reservationOrgId,
      p_store_id: storeId,
      p_order_type: reservationOrderType,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim() || null,
      p_product_name: productLabel || "Reserved items",
      p_total_amount: grandTotal,
      p_paid_amount: Number(paidAmount || 0),
      p_note: finalNote,
    } as any);

    if (error) throw error;
    submission.current.committed();
    await clearPersistedSalesCart();

    const successMsg =
      reservationOrderType === "PRE_ORDER"
        ? "Pre Order imehifadhiwa vizuri."
        : "Reservation imehifadhiwa vizuri.";

    if (Platform.OS === "web") {
      setWebBanner({ type: "success", text: successMsg });
      setTimeout(() => {
        router.replace({
  pathname: "/stores/orders",
  params: {
    orgId: reservationOrgId,
    storeId,
    storeName: headerStoreName,
  },
} as any);
      }, 650);
    } else {
      Alert.alert(uiText("Success ✅"), systemText(successMsg), [
        {
          text: uiText("OK"),
          onPress: () =>
  router.replace({
    pathname: "/stores/orders",
    params: {
      orgId: reservationOrgId,
      storeId,
      storeName: headerStoreName,
    },
  } as any),
        },
      ]);
    }
  } catch (e: any) {
    const msg = submission.current.blocked
      ? "Order outcome requires review. Check order history before retrying."
      : e?.message ?? "Failed to save reservation/pre-order.";
    if (Platform.OS === "web") setWebBanner({ type: "error", text: msg });
    else Alert.alert(uiText("Failed"), systemText(msg));
  } finally {
    setSaving(false);
  }
  return;
}

if (isOffline) {
      try {
        const clientSaleId = /^[0-9a-f-]{36}$/i.test(String(one(params.cartId)??''))?String(one(params.cartId)):makeId();

        if (String(activeRole ?? "").trim().toLowerCase() === "cashier") {
          const cashierShiftId = await getMyOpenCashierShiftId(storeId);
          if (!cashierShiftId) {
            throw new Error("Cashier hana OPEN shift. Fungua shift kwanza kabla ya kufanya sale.");
          }
        }

        const items = checkoutCart.map((c) => ({
          product_id: c.product_id,
          qty: Number(Number(c.qty).toFixed(3)),
          unit_price: getAdjustedUnitPrice(c),
          name: c.name ?? "Product",
          sku: c.sku ?? null,
          unit: c.unit ?? null,
        }));

        const p_paid_amount = Number.isFinite(paidAmount) ? Number(paidAmount) : 0;
        const p_payment_method = rpcPaymentMethod;

        const p_payment_channel =
          p_payment_method === "MOBILE" || p_payment_method === "BANK"
            ? rpcChannel.trim() || null
            : null;
        const p_reference =
          p_payment_method === "MOBILE" || p_payment_method === "BANK"
            ? rpcReference.trim() || null
            : null;

        const customerLines = isCredit
          ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n`
          : "";

        const splitLines =
          isSplit
            ? `SPLIT_PAYMENT: CASH=${plainPriceAmount(Number.isFinite(splitCashAmount) ? splitCashAmount : 0)} | MOBILE=${plainPriceAmount(Number.isFinite(splitMobileAmount) ? splitMobileAmount : 0)} | BANK=${plainPriceAmount(Number.isFinite(splitBankAmount) ? splitBankAmount : 0)}\n`
            : "";

        const finalNote = buildNoteWithDiscount({
          note: `${customerLines}${splitLines}${note || ""}`,
          discountText,
          discountAmount: discount.amount,
          subtotal: subtotalAmount,
        });

        const rpcDiscountType =
          discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

        const rpcDiscountValue =
          discount.type === "percent"
            ? Number(discount.value || 0)
            : discount.type === "fixed"
              ? Number(discount.amount || 0)
              : null;

        await enqueueSale(storeId, {
          client_sale_id: clientSaleId,
          store_id: storeId,
          payload: {
            items,
            note: finalNote,
            payment_method: p_payment_method,
            paid_amount: p_paid_amount,
            payment_channel: p_payment_channel,
            reference: p_reference,
            discount_type: rpcDiscountType as any,
            discount_value: rpcDiscountValue,
            discount_note: discountText.trim() || null,
            is_credit: isCredit,
            customer_name: customerName.trim() || null,
customer_phone: customerPhone.trim() || null,
            credit_balance: Number(balance || 0),
            sold_by_membership_id: effectiveSoldByMembershipId || null,
          },
        });

        submission.current.committed();
        await clearPersistedSalesCart();
        await rememberAttempt({id:clientSaleId,intent:saleIntent,phase:'QUEUED',requiresFollowUp:false});
        const successMsg = "Sale imehifadhiwa. Itasync mtandao ukirudi.";
        void playSaleSuccessSoundSafe();

        if (Platform.OS === "web") {
          setWebBanner({ type: "success", text: successMsg });
          setTimeout(() => {
            router.replace("/(tabs)/sales/history" as any);
          }, 650);
        } else {
          Alert.alert(uiText("Saved Offline ✅"), systemText(successMsg));
          router.replace("/(tabs)/sales/history" as any);
        }
      } catch (e: any) {
        const msg = submission.current.committedSale
          ? "Sale saved offline; cart cleanup failed. Open history before starting another sale."
          : e?.message ?? "Failed to save offline";
        if (Platform.OS === "web") {
          setWebBanner({ type: "error", text: msg });
        } else {
          Alert.alert(uiText("Failed"), systemText(msg));
        }
      }
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        preflightCheckStock(),
        supabase.rpc("ensure_my_store_access", { p_store_id: storeId }).then(({error})=>{if(error)throw error}),
      ]);

      const items = checkoutCart.map((c) => ({
        product_id: c.product_id,
        qty: Number(Number(c.qty).toFixed(3)),
        unit_price: getAdjustedUnitPrice(c),
      }));

      const p_paid_amount = Number(paidAmount);

      const customerLines = isCredit
        ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n`
        : "";

      const splitLines =
        isSplit
          ? `SPLIT_PAYMENT: CASH=${plainPriceAmount(Number.isFinite(splitCashAmount) ? splitCashAmount : 0)} | MOBILE=${plainPriceAmount(Number.isFinite(splitMobileAmount) ? splitMobileAmount : 0)} | BANK=${plainPriceAmount(Number.isFinite(splitBankAmount) ? splitBankAmount : 0)}\n`
          : "";

      const finalNote = buildNoteWithDiscount({
        note: `${customerLines}${splitLines}${note || ""}`,
        discountText,
        discountAmount: discount.amount,
        subtotal: subtotalAmount,
      });

      const rpcDiscountType =
        discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

      const rpcDiscountValue =
        discount.type === "percent"
          ? Number(discount.value || 0)
          : discount.type === "fixed"
            ? Number(discount.amount || 0)
            : null;

      const clientSaleId = /^[0-9a-f-]{36}$/i.test(String(one(params.cartId)??''))?String(one(params.cartId)):makeId();

      let cashierShiftId: string | null = null;
      const isCashierUser = String(activeRole ?? "").trim().toLowerCase() === "cashier";

      if (isCashierUser) {
        cashierShiftId = await getMyOpenCashierShiftId(storeId);
        if (!cashierShiftId) {
          throw new Error("Cashier hana OPEN shift. Fungua shift kwanza kabla ya kufanya sale.");
        }
      }

      const durableAttempt:SaleAttempt={id:clientSaleId,intent:saleIntent,phase:'DISPATCHED',requiresFollowUp:!!customerPhone.trim()||isCredit};
      await rememberAttempt(durableAttempt);
      submission.current.dispatched();
      const res = await supabase.rpc("create_sale_with_payment_v6", {
        p_store_id: storeId,
        p_items: items,
        p_note: finalNote,
        p_payment_method: rpcPaymentMethod,
        p_paid_amount: p_paid_amount,
        p_payment_channel:
          rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK"
            ? rpcChannel.trim() || null
            : null,
        p_reference:
          rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK"
            ? rpcReference.trim() || null
            : null,
       p_customer_id: null,
p_customer_phone: customerPhone.trim() || null,
p_customer_full_name: customerName.trim() || null,
        p_discount_type: rpcDiscountType,
        p_discount_value: rpcDiscountValue,
        p_discount_note: discountText.trim() || null,
        p_client_sale_id: clientSaleId,
        p_cashier_shift_id: isCashierUser ? cashierShiftId : null,
        p_sold_by_membership_id: effectiveSoldByMembershipId || null,
      } as any);

      if (res.error) {
        if(definitiveSaleRejection(res.error.code)){
          await AsyncStorage.removeItem(saleAttemptKey({organizationId:orgId,storeId,actorId:cartActor}));
          setAttemptRecovery(null);submission.current=new SubmissionGate();
        }
        throw res.error;
      }

      const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      const saleId: string | null =
        row?.sale_id != null
          ? String(row.sale_id)
          : row != null && typeof row === "string"
            ? String(row)
            : null;

      if (!saleId) throw new Error("Sale response missing an identifier; verify history before retrying.");
      submission.current.committed();
      await rememberAttempt({...durableAttempt,phase:'BASE_COMMITTED',saleId});
      if (saleId && customerPhone.trim()) {
        const attachRes = await supabase.rpc("attach_customer_to_sale", {
          p_sale_id: saleId,
          p_store_id: storeId,
          p_phone: customerPhone.trim(),
          p_name: customerName.trim() || null,
          p_amount: grandTotal,
        } as any);

        if (attachRes.error) throw attachRes.error;
      }

      let creditRecorded = false;
      if (isCredit && balance > 0) {
        const accountId = await ensureCreditAccountV2({
          storeId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || null,
        });

        await recordCreditSaleV2({
          storeId,
          creditAccountId: accountId,
          amount: Number(balance),
          note: finalNote,
          reference: saleId ?? null,
        });

        creditRecorded = true;
      }

      const successMsg = creditRecorded
        ? "Sale created successfully (credit recorded v2)"
        : "Sale created successfully";

      await clearPersistedSalesCart();
      await rememberAttempt({...durableAttempt,phase:'COMPLETE',saleId});
      void playSaleSuccessSoundSafe();

      if (Platform.OS === "web") {
        setWebBanner({ type: "success", text: successMsg });

        const confirmed =
          typeof window === "undefined"
            ? true
            : window.confirm(
                creditRecorded
                  ? "Sale created (credit recorded v2)\n\nBonyeza OK kufungua receipt."
                  : "Sale created\n\nBonyeza OK kufungua receipt."
              );

        if (confirmed) {
          if (saleId) {
            router.replace({
              pathname: "/(tabs)/sales/receipt",
              params: { saleId },
            } as any);
          } else {
            router.replace("/(tabs)/sales/history" as any);
          }
        }
      } else {
        Alert.alert(
          uiText("Success ✅"),
          creditRecorded ? uiText("Sale created (credit recorded v2)") : uiText("Sale created"),
          [
            {
              text: uiText("OK"),
              onPress: () => {
                if (saleId) {
                  router.replace({
                    pathname: "/(tabs)/sales/receipt",
                    params: { saleId },
                  } as any);
                } else {
                  router.replace("/(tabs)/sales/history" as any);
                }
              },
            },
          ]
        );
      }
    } catch (e: any) {
      const msg = submission.current.blocked
        ? (submission.current.committedSale
          ? "Sale created; a follow-up step failed. Verify history before starting another sale."
          : "Sale outcome is unconfirmed. Verify history before retrying.")
        : e?.message ?? "Unknown error";
      if (Platform.OS === "web") {
        setWebBanner({ type: "error", text: msg });
      } else {
        Alert.alert(uiText("Failed"), systemText(msg));
      }
    } finally {
      setSaving(false);
    }
    } finally {
      submission.current.release();
      setSaving(false);
    }
  }, [
    attemptReady,attemptRecovery,rememberAttempt,saleIntent,params.cartId,cartActor,
    saving,
    invalidReason,
    cashierMode,
    note,
    discountText,
    discount.amount,
    subtotalAmount,
    conversionId,conversionQuote,conversionChecked,isOnline,params.proformaOrg,orgId,conversionLanguage,conversionApi,method,paidVia,channel,reference,splitCashAmount,splitMobileAmount,splitBankAmount,checkoutCart,
    storeId,
    grandTotal,
    router,
    isOffline,
    paidAmount,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    isCredit,
    customerName,
    customerPhone,
    balance,
    preflightCheckStock,
    ensureCreditAccountV2,
    recordCreditSaleV2,
    discount,
    activeRole,
    effectiveSoldByMembershipId,
    setWebBanner,
    clearPersistedSalesCart,
    isSplit,
    splitCashAmount,
    splitMobileAmount,
    splitBankAmount,
reservationMode,
reservationOrderType,
reservationOrgId,
headerStoreName,
  ]);

  const cartTotalLabel = useMemo(() => {
    const itemsCount = checkoutCart.length;
    return uiText(itemsCount === 1 ? "{p0} item • {p1} qty" : "{p0} items • {p1} qty", {p0: itemsCount, p1: totalQty});
  }, [checkoutCart.length, totalQty, uiText]);

  const prettySubtotal = useMemo(() => fmt(subtotalAmount), [fmt, subtotalAmount]);
  const prettyDiscount = useMemo(() => fmt(discount.amount), [fmt, discount.amount]);
  const prettyTotal = useMemo(() => fmt(grandTotal), [fmt, grandTotal]);
  const prettyPaid = useMemo(
    () => fmt(Number.isFinite(paidAmount) ? paidAmount : 0),
    [fmt, paidAmount]
  );
  const prettyBal = useMemo(() => fmt(balance), [fmt, balance]);

  const showChannelRef = useMemo(() => {
    if (cashierMode) return false;
    if (isOffline) return false;
    if (method === "SPLIT") return !!conversionId&&(splitMobileAmount>0||splitBankAmount>0);
    return rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK";
  }, [cashierMode, isOffline, rpcPaymentMethod,method,conversionId,splitMobileAmount,splitBankAmount]);

  const summaryCard = (
    <Card style={checkoutCardStyle("#3B82F6", "#F8FBFF", isDesktopWeb)}>
      {!!conversionId&&<Text accessibilityRole="alert" style={{color:conversionChecked?'#334155':'#9a3412',marginBottom:10}}>{conversionText(conversionLanguage,conversionChecked?'checkout':'stale')}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {uiText("🧾 Order Summary")}</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
            {cartTotalLabel}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(52,211,153,0.22)",
            backgroundColor: "rgba(52,211,153,0.10)",
            maxWidth: "100%",
            flexShrink: 1,
          }}
        >
          <Text
            style={{ color: theme.colors.text, fontWeight: "900" }}
          >
            {prettyTotal}
          </Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      <View style={{ gap: 10 }}>
        {checkoutCart.map((c, index) => {
          const baseUnit = fmt(Number(c.unit_price || 0));
          const adjustedUnit = fmt(getAdjustedUnitPrice(c));
          const adjustedLine = fmt(getAdjustedLineTotal(c));
          const extra = getExtraPerQty(c);
          const extraLabel = extra !== 0 ? fmt(Math.abs(extra)) : null;

          return (
            <View
              key={`${c.product_id}-${c.sku ?? ""}-${index}`}
              style={{
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: theme.colors.text, fontWeight: "900" }}
                    numberOfLines={isDesktopWeb ? 2 : 1}
                  >
                    {c.name}
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontWeight: "800",
                      lineHeight: 18,
                      marginTop: 2,
                    }}
                    numberOfLines={isDesktopWeb ? 3 : 1}
                  >
                    {uiText("SKU:")}{c.sku ?? "—"} {uiText("• Qty:")}{c.qty} {uiText("• Unit:")}{c.unit ?? "—"}
                  </Text>
                </View>

                <Pressable
                  testID={`checkout-price-adjust-${index}`} accessibilityRole="button" accessibilityLabel={uiText("Adjust Price")} disabled={saving||!canAdjustPrice}
                  onPress={() => openAdjustModal(index)}
                  style={({ pressed }) => ({
                    minWidth: 42,
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.30)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                    opacity: pressed ? 0.9 : 1,
                    flexShrink: 0,
                    marginTop: 2,
                  })}
                >
                  <SafeIcon name="add" size={20} color={theme.colors.emerald} />
                </Pressable>
              </View>

              <Text
                style={{ color: theme.colors.faint, fontWeight: "900", lineHeight: 18 }}
              >
                {uiText("Unit:")}{adjustedUnit} {uiText("• Line:")}{adjustedLine}
              </Text>

              {extra !== 0 ? (
                <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>{adjustmentText('change')}: {extra<0?'−':'+'}{extraLabel}</Text>
              ) : (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  {uiText("Hakuna markup bado")}</Text>
              )}

              {extra !== 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  {uiText("Base Unit:")}{baseUnit}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        <View style={{ flex: 1, minWidth: 140, flexBasis: 140 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>{uiText("Subtotal")}</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {prettySubtotal}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 140, flexBasis: 140 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>{uiText("Discount")}</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {prettyDiscount}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 140, flexBasis: 140 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>{uiText("Total")}</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {prettyTotal}
          </Text>
        </View>
      </View>
    </Card>
  );

  const discountNoteCard = (
    <Card style={checkoutCardStyle("#F59E0B", "#FFFBEB", isDesktopWeb)}>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
        {uiText("🎯 Discount & Note")}</Text>

      <View>
        <FieldLabel>{uiText("Discount (e.g. 10% • 5000 • 5k • 1m)")}</FieldLabel>
        <InputBox
          value={discountText}
          onChangeText={setDiscountText}
          placeholder={uiText("mf: 10% au 5000 au 5k")}
          keyboardType="default"
        />
        <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8, lineHeight: 17 }}>
          {adjustmentText('orderDiscount')}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(15,23,42,0.06)" }} />

      <View>
        <FieldLabel>{uiText("Note (optional)")}</FieldLabel>
        <InputBox
          value={note}
          onChangeText={setNote}
          placeholder={
            cashierMode
              ? uiText("andika maelezo ya order kwa cashiers...")
              : uiText("andika maelezo ya mauzo...")
          }
          keyboardType="default"
          multiline
        />
      </View>
    </Card>
  );

const staffAttributionCard = (
      <Card style={checkoutCardStyle("#8B5CF6", "#FAF5FF", isDesktopWeb)}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          {uiText("👥 Staff Attribution")}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18, fontSize: 12 }}>
          {String(activeRole ?? "").trim().toLowerCase() === "staff"
            ? uiText("Default sale itahesabiwa kwako. Badilisha tu kama staff mwingine ndiye amefanya sale.")
            : uiText("Chagua staff kwa commission attribution. Ukiacha wazi, sale itaendelea kawaida.")}
        </Text>

        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => setStaffDropdownOpen((v) => !v)}
            style={{
              borderWidth: 1,
              borderColor: staffDropdownOpen
                ? "rgba(52,211,153,0.30)"
                : theme.colors.border,
              backgroundColor: staffDropdownOpen
                ? "rgba(52,211,153,0.10)"
                : "rgba(255,255,255,0.04)",
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: effectiveSoldByMembershipId ? theme.colors.emerald : theme.colors.text,
                fontWeight: "900",
              }}
            >
              {effectiveSoldByMembershipId ? selectedSoldByLabel : uiText("No staff attribution")}
            </Text>

            <SafeIcon
              name={staffDropdownOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.colors.muted}
            />
          </Pressable>

          {staffDropdownOpen ? (
            <View style={{ gap: 8 }}>
              {String(activeRole ?? "").trim().toLowerCase() !== "staff" ? (
                <Pressable
                  onPress={() => {
                    setSoldByMembershipId("");
                    setStaffDropdownOpen(false);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: !soldByMembershipId
                      ? "rgba(52,211,153,0.30)"
                      : theme.colors.border,
                    backgroundColor: !soldByMembershipId
                      ? "rgba(52,211,153,0.10)"
                      : "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text
                    style={{
                      color: !soldByMembershipId ? theme.colors.emerald : theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    {uiText("No staff attribution")}</Text>
                </Pressable>
              ) : null}

              {staffOptions.map((row) => {
                const membershipId = String(row.membership_id ?? "");
                const label =
                  pickStaffEmail(row) ?? `Membership ${membershipId.slice(0, 8)}...`;
                const active = effectiveSoldByMembershipId === membershipId;

                return (
                  <Pressable
                    key={membershipId}
                    onPress={() => {
                      setSoldByMembershipId(membershipId);
                      setStaffDropdownOpen(false);
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: active
                        ? "rgba(52,211,153,0.30)"
                        : theme.colors.border,
                      backgroundColor: active
                        ? "rgba(52,211,153,0.10)"
                        : "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: active ? theme.colors.emerald : theme.colors.text,
                        fontWeight: "900",
                      }}
                    >
                      {(pickStaffEmail(row) ?? uiText("Membership {p0}...", {p0: (membershipId.slice(0, 8))}))}
                    </Text>
                  </Pressable>
                );
              })}

              {staffOptions.length === 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  {uiText("Hakuna staff waliosajiliwa kwenye store hii kwa sasa.")}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
       </Card>
    );
  const paymentCard = !cashierMode ? (
    <Card style={checkoutCardStyle("#10B981", "#F0FDF4", isDesktopWeb)}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          {uiText("💳 Payment")}</Text>
        <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 12 }}>
          {uiText(paymentMethodKey(method))}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        {[
          ["Cash", "CASH"],
          ["Mobile", "MOBILE"],
          ["Bank", "BANK"],
          ["Split", "SPLIT"],
          ["Credit", "CREDIT"],
        ].map(([label, value]) => (
          <MethodChip
            key={value}
            label={uiText(paymentMethodKey(label))}
            active={method === value}
            onPress={() => onSetMethod(value as CheckoutMethod)}
            compact={isDesktopWeb}
          />
        ))}
      </View>

      {method === "SPLIT" ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: isDesktopWeb ? "row" : "column", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>{uiText("Cash ({p0})", {p0: (displayCurrency)})}</FieldLabel>
              <InputBox
                value={splitCashStr}
                onChangeText={(v) => setSplitCashStr(normalizeMoneyInput(v,preservePricePrecision))}
                placeholder="300000"
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <FieldLabel>{uiText("Mobile ({p0})", {p0: (displayCurrency)})}</FieldLabel>
              <InputBox
                value={splitMobileStr}
                onChangeText={(v) => setSplitMobileStr(normalizeMoneyInput(v,preservePricePrecision))}
                placeholder="250000"
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <FieldLabel>{uiText("Bank ({p0})", {p0: (displayCurrency)})}</FieldLabel>
              <InputBox
                value={splitBankStr}
                onChangeText={(v) => setSplitBankStr(normalizeMoneyInput(v,preservePricePrecision))}
                placeholder="50000"
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
            {uiText("Split total lazima ilingane na sale total.")}</Text>
        </View>
      ) : (
        <View>
          <FieldLabel>{uiText("Paid ({p0})", {p0: (displayCurrency)})}</FieldLabel>
          <InputBox
            value={paidStr}
            onChangeText={onPaidChange}
            placeholder="120000"
            keyboardType="numeric"
          />
          <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
            {method === "CREDIT"
              ? uiText("Credit inaruhusu 0 au partial payment.")
              : uiText("Non-credit lazima ilipwe full total.")}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <CheckoutMiniTile label={uiText("Total")} value={prettyTotal} />
        <CheckoutMiniTile label={uiText("Paid")} value={prettyPaid} />
        <CheckoutMiniTile label={uiText("Balance")} value={prettyBal} highlight={isCredit || balance > 0} />
      </View>

      {method === "CREDIT" ? (
        <>
          <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
            {uiText("CREDIT MODE: ukiweka Paid zaidi ya 0, chagua njia ya pesa iliyopokelewa.")}</Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              opacity: showPaidVia ? 1 : 0.55,
            }}
          >
            <MethodChip
              label={uiText("Cash")}
              active={paidVia === "CASH"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("CASH");
              }}
            />
            <MethodChip
              label={uiText("Mobile")}
              active={paidVia === "MOBILE"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("MOBILE");
                if (!channel) setChannel("M-PESA");
              }}
            />
            <MethodChip
              label={uiText("Bank")}
              active={paidVia === "BANK"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("BANK");
              }}
            />
          </View>
        </>
      ) : null}

      {showChannelRef ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: isDesktopWeb ? "row" : "column", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>
                {rpcPaymentMethod === "MOBILE" ? uiText("Mobile Channel") : uiText("Bank Channel")}
              </FieldLabel>
              <InputBox
                value={channel}
                onChangeText={setChannel}
                placeholder={rpcPaymentMethod === "MOBILE" ? "M-PESA" : "NMB"}
                keyboardType="default"
              />
            </View>

            <View style={{ flex: 1 }}>
              <FieldLabel>{uiText("Reference / Transaction ID")}</FieldLabel>
              <InputBox
                value={reference}
                onChangeText={setReference}
                placeholder="TXN12345"
                keyboardType="default"
              />
            </View>
          </View>
        </View>
      ) : null}

      {isOffline ? (
        <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
          {uiText("OFFLINE: sale itasave offline na itasync mtandao ukirudi.")}</Text>
      ) : null}
    </Card>
  ) : null;

  const customerCard = (
      <Card style={checkoutCardStyle("#06B6D4", "#ECFEFF", isDesktopWeb)}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          {uiText("👤 Customer Tracking")}</Text>

        <View>
          <FieldLabel>
  {uiText("Customer Name")}{cashierMode ? uiText("(optional)") : isCredit ? "*" : uiText("(optional)")}
</FieldLabel>
          <TextInput
            value={customerName}
            onFocus={() => {
              setCustomerSearchFocused("name");
              setCustomerSuggestionsOpen(true);
            }}
            onChangeText={(v) => {
              setCustomerName(v);
              setCustomerSearchFocused("name");
              setCustomerSuggestionsOpen(true);
            }}
            placeholder={uiText("mf: Juma Ali")}
            placeholderTextColor="#64748B"
            keyboardType="default"
            style={{
              color: theme.colors.text,
              fontWeight: "800",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>

        <View>
          <FieldLabel>{uiText("Customer Phone (optional but recommended)")}</FieldLabel>
          <TextInput
            value={customerPhone}
            onFocus={() => {
              setCustomerSearchFocused("phone");
              setCustomerSuggestionsOpen(true);
            }}
            onChangeText={(v) => {
              setCustomerPhone(v);
              setCustomerSearchFocused("phone");
              setCustomerSuggestionsOpen(true);
            }}
            placeholder={uiText("mf: 0712xxxxxx")}
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
            style={{
              color: theme.colors.text,
              fontWeight: "800",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>

        {customerSuggestionsOpen && filteredCustomerOptions.length > 0 ? (
          <View style={{ gap: 8 }}>
            {filteredCustomerOptions.map((c) => {
              const name = String(c.full_name ?? "").trim() || "Customer";
              const phone = String(c.phone ?? c.normalized_phone ?? "").trim() || "—";

              return (
                <Pressable
                  key={c.id}
                  onPress={() => selectCheckoutCustomer(c)}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.22)",
                    backgroundColor: "rgba(52,211,153,0.08)",
                    borderRadius: 16,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                    {(String((c.full_name ?? "")).trim() || uiText("Customer"))}
                  </Text>
                  <Text
                    style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {phone}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 17 }}>
          {uiText("Tip: Ukimchagua mteja, sale itaunganishwa automatically kwenye CRM file yake.")}</Text>
      </Card>
    );

  const actionCard = (
    <Card style={checkoutCardStyle("#2563EB", "#EFF6FF", isDesktopWeb)}>
      <Button
        title={
          saving
            ? cashierMode
              ? uiText("Sending...")
              : uiText("Creating...")
            : cashierMode
              ? uiText("Send to Cashiers")
            : reservationMode
  ? reservationOrderType === "PRE_ORDER"
    ? uiText("Save Pre Order")
    : uiText("Save Reservation")
  : isOffline
    ? uiText("Save Offline")
    : uiText("Confirm Sale")
        }
        onPress={confirm}
        disabled={saving || !attemptReady || !!attemptRecovery || submission.current.blocked || !!invalidReason}
        variant="primary"
      />
      {attemptRecovery&&<View style={{gap:8}}><Text>{posStabilityText(conversionLanguage,'unresolved')}</Text><Button title={posStabilityText(conversionLanguage,'history')} variant="secondary" onPress={()=>router.push('/sales/history' as any)}/><Button title={uiText('Refresh')} variant="secondary" onPress={()=>void reviewSale()}/></View>}
      {checkoutCart.length===0&&<View style={{gap:8}}><Text>{posStabilityText(conversionLanguage,'recovery')}</Text><Button title={uiText('Back')} variant="secondary" onPress={()=>router.replace('/sales' as any)}/></View>}
      <CheckoutProformaAction
        organizationId={orgId || null} storeId={storeId || null}
        storeOrganizationId={orgCtx.stores?.find((row: any) => row.store_id === storeId && row.organization_id === orgId && row.is_allowed !== false)?.organization_id ?? null}
        role={activeRole ?? null} busy={saving||!!attemptRecovery} online={isOnline} hasItems={!conversionId&&checkoutCart.length > 0}
        onOpen={async () => {
          const {data:{session}}=await supabase.auth.getSession();
          if(!session?.user.id)return;
          const draftId=stageProformaCart({organizationId:orgId,storeId,actorId:session.user.id},checkoutCart.map(item=>({product_id:item.product_id,name:item.name,qty:item.qty,unit_price:getAdjustedUnitPrice(item),catalog_unit_price:item.unit_price,price_adjustment:getExtraPerQty(item),unit:item.unit})),{customerName,customerPhone,notes:note,discountType:discount.type==='percent'?'percent':'fixed',discountValue:String(discount.value||0),subtotal:String(subtotalAmount),discountAmount:String(discount.amount||0),total:String(grandTotal),sourceCart:cartSignature(cart)});
          proformaDraftRef.current=draftId;
          router.push({ pathname: "/sales/proforma", params: { storeId,mode:'new',draftId } } as any);
        }}
      />
      <Button title={uiText("Back")} onPress={() => router.back()} disabled={saving} variant="secondary" />

      {!!invalidReason && (
        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>⚠ {invalidReason}</Text>
      )}
    </Card>
  );

  const adjustTargetItem =
    adjustTargetIndex != null ? checkoutCart[adjustTargetIndex] ?? null : null;

  let adjustPreviewExtra=0;let adjustmentPreview:CartItem[]|null=null;
  try{adjustPreviewExtra=parseAdjustment(adjustValue,adjustDirection);adjustmentPreview=applyItemAdjustment(checkoutCart,adjustTargetIndex??-1,adjustApplyToAll,adjustPreviewExtra);}catch{}
  const adjustPreviewQty=Number(adjustTargetItem?.qty??0);
  const previewRows=adjustmentPreview?.filter((_,i)=>adjustApplyToAll||i===adjustTargetIndex)??[];

  return (
    <Screen scroll bottomPad={isDesktopWeb ? 16 : 240}>
      <Modal
        visible={adjustModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAdjustModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: isDesktopWeb ? 24 : 16,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12,direction:conversionLanguage==='ar'?'rtl':'ltr'}}
            style={{
              flexGrow:0,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "#FFFFFF",
              width: isDesktopWeb ? "100%" : undefined,
              maxWidth: isDesktopWeb ? 640 : undefined,
              alignSelf: isDesktopWeb ? "center" : undefined,
              padding: isDesktopWeb ? 18 : 16,
              maxHeight:"90%",
              gap: isDesktopWeb ? 10 : 12,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
              {uiText("Adjust Price")}</Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {adjustTargetItem?.name ?? uiText("Item")}
            </Text>

            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {([1,-1] as const).map(direction=><Pressable key={direction} accessibilityRole="radio" accessibilityState={{checked:adjustDirection===direction}} onPress={()=>setAdjustDirection(direction)} style={{padding:12,minHeight:44,borderWidth:1,borderColor:adjustDirection===direction?theme.colors.emerald:theme.colors.border,borderRadius:10}}><Text style={{color:theme.colors.text,fontWeight:'700'}}>{adjustmentText(direction===1?'increase':'decrease')}</Text></Pressable>)}
            </View>
            <View><FieldLabel>{adjustmentText('amount')}</FieldLabel><InputBox value={adjustValue} onChangeText={setAdjustValue} placeholder="0" keyboardType="decimal-pad" /></View>
            <Text style={{color:theme.colors.muted}}>{adjustmentText('orderDiscount')}</Text>
            <View style={{ flexDirection: isDesktopWeb ? "row" : "column", gap: 8 }}>
              <Pressable
                onPress={() => setAdjustApplyToAll(false)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: !adjustApplyToAll
                    ? "rgba(52,211,153,0.40)"
                    : theme.colors.border,
                  backgroundColor: !adjustApplyToAll
                    ? "rgba(52,211,153,0.10)"
                    : "rgba(255,255,255,0.04)",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.92 : 1,
                flex: isDesktopWeb ? 1 : undefined,
                  })}
              >
                <Text
                  style={{
                    color: !adjustApplyToAll ? theme.colors.emerald : theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  {uiText("This item only")}</Text>
              </Pressable>

              <Pressable
                onPress={() => setAdjustApplyToAll(true)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: adjustApplyToAll
                    ? "rgba(52,211,153,0.40)"
                    : theme.colors.border,
                  backgroundColor: adjustApplyToAll
                    ? "rgba(52,211,153,0.10)"
                    : "rgba(255,255,255,0.04)",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.92 : 1,
                flex: isDesktopWeb ? 1 : undefined,
                  })}
              >
                <Text
                  style={{
                    color: adjustApplyToAll ? theme.colors.emerald : theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  {uiText("Apply to all items")}</Text>
              </Pressable>
            </View>

            <View
              style={{
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.18)",
                backgroundColor: "rgba(52,211,153,0.08)",
                gap: 4,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {uiText("Preview")}</Text>

              {previewRows.map((item,index)=><Text key={index} style={{color:theme.colors.text}}>{item.name}: {fmt(item.unit_price)} → {fmt(getAdjustedUnitPrice(item))} × {item.qty} = {fmt(getAdjustedLineTotal(item))}</Text>)}
              {!adjustmentPreview&&<Text accessibilityRole="alert" style={{color:'#B91C1C'}}>{adjustmentText('invalid')}</Text>}

            </View>

            <Button title={adjustmentText('reset')} variant="secondary" onPress={()=>{setAdjustValue('0');setAdjustDirection(1);setAdjustApplyToAll(false);}} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title={uiText("Cancel")} onPress={closeAdjustModal} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={uiText("Apply")} onPress={applyAdjustment} disabled={!adjustmentPreview||!canAdjustPrice} variant="primary" />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <View
  style={{
    flex: 1,
    gap: isDesktopWeb ? 12 : 14,
    backgroundColor: isDesktopWeb ? "#F8FAFC" : undefined,
    padding: isDesktopWeb ? 10 : 0,
    borderRadius: isDesktopWeb ? 28 : 0,
          width: "100%",
          maxWidth: isDesktopWeb ? desktopShellWidth : 980,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
         <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <SafeIcon name="chevron-left" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              {cashierMode
  ? uiText("Cashier Handoff")
  : reservationMode
    ? reservationOrderType === "PRE_ORDER"
      ? uiText("Pre Order Checkout")
      : uiText("Reservation Checkout")
    : uiText("Checkout")}
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {uiText("Store:")}{headerStoreName}
              {isOffline ? uiText("  •  OFFLINE") : uiText("  •  ONLINE")}
            </Text>
          </View>
        </View>

        {webBanner ? (
          <Card
            style={{
              gap: 6,
              borderColor:
                webBanner.type === "success"
                  ? "rgba(52,211,153,0.28)"
                  : "rgba(239,68,68,0.28)",
              backgroundColor:
                webBanner.type === "success"
                  ? "rgba(52,211,153,0.10)"
                  : "rgba(239,68,68,0.10)",
            }}
          >
            <Text
              style={{
                color:
                  webBanner.type === "success"
                    ? theme.colors.emerald
                    : theme.colors.danger,
                fontWeight: "900",
              }}
            >
              {webBanner.type === "success" ? uiText("Success ✅") : uiText("Failed ❌")}
            </Text>

            <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
              {webBanner.text}
            </Text>
          </Card>
        ) : null}

        {mismatch ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              {uiText("⚠️ Store mismatch: Active store na store ya checkout ni tofauti.")}{"\n"}{uiText("Rudi nyuma → chagua store sahihi → checkout upya.")}</Text>
          </Card>
        ) : null}

        {cashierMode ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              {uiText("Cashier Flow")}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {uiText("Hapa order itatumwa kwenye cashier queue ya store hii. Cashier yeyote aliye-assigniwa store hii anaweza kuipokea na kukamilisha malipo.")}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {uiText("• Hii mode inahitaji ONLINE")}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {uiText("• Store lazima iwe na cashier angalau mmoja aliye-assigniwa")}</Text>
          </Card>
        ) : null}

        {!cashierMode && String(activeRole ?? "").trim().toLowerCase() === "cashier" ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              {uiText("Cashier Shift Link")}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {uiText("Sale za cashier zitafungwa kwenye OPEN shift ya cashier huyu kwa store hii.")}</Text>
            <Text
              style={{
                color: openCashierShiftId ? theme.colors.emerald : theme.colors.danger,
                fontWeight: "900",
              }}
            >
              {openCashierShiftId
                ? uiText("OPEN SHIFT: {p0}...", {p0: (openCashierShiftId.slice(0, 8))})
                : uiText("Hakuna OPEN cashier shift kwa store hii.")}
            </Text>
          </Card>
        ) : null}
{isDesktopWeb ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
            }}
          >
            <View
              style={{
                flex: 1.08,
                minWidth: 0,
                gap: 8,
              }}
            >
              {summaryCard}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                  width: "100%",
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  {discountNoteCard}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  {customerCard}
                </View>
              </View>
            </View>

            <View
              style={{
                flex: 0.92,
                minWidth: 0,
                gap: 8,
              }}
            >
              {paymentCard}
              {staffAttributionCard}
              {actionCard}
            </View>
          </View>
        ) : (
          <>
            {summaryCard}
            {discountNoteCard}
            {staffAttributionCard}
            {paymentCard}
            {customerCard}
            {actionCard}
          </>
        )}

        <View style={{ height: isDesktopWeb ? 10 : 24 }} />
      </View>
    </Screen>
  );
}
