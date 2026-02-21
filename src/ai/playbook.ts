// src/ai/playbook.ts

export type PlayContext = {
  activeOrgId?: string | null; // ✅ needed for AI-SUB-GATE
  activeOrgName?: string | null;
  activeStoreName?: string | null;
  activeRole?: string | null;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function has(textUpper: string, keys: string[]) {
  for (const k of keys) {
    if (textUpper.includes(k)) return true;
  }
  return false;
}

function isOwnerOrAdmin(role?: string | null) {
  const r = String(role ?? "").toLowerCase();
  return r === "owner" || r === "admin";
}

/** Keywords for blocking secrets / sensitive */
export function isSensitiveRequest(text: string) {
  const U = clean(text).toUpperCase();
  return has(U, [
    "SERVICE ROLE",
    "SERVICE_ROLE",
    "SUPABASE KEY",
    "ANON KEY",
    "ANON_KEY",
    "JWT",
    "PRIVATE KEY",
    "PASSWORD",
    "TOKEN",
    "SECRET",
    "API KEY",
    "API_KEY",
    "ENV",
    ".ENV",
  ]);
}

/**
 * INTEL-CORE v1 Intents:
 * - Business intents (route to BUSINESS brain)
 * - How-to ZETRA intents (playbooks)
 */
export type Intent =
  // ZETRA how-to
  | "APP_ONBOARDING"
  | "OPEN_STORE"
  | "ADD_PRODUCT"
  | "SALES_OFFLINE"
  | "SALES_RECEIPT"
  | "SALES_HISTORY"
  | "STAFF"
  | "CLUB_CREATE_POST"
  | "CLUB_ORDERS"
  | "INBOX"
  | "CREDIT"
  | "TROUBLESHOOTING"
  // Business brains
  | "PRICING"
  | "MARKETING"
  | "OPERATIONS"
  | "FINANCE"
  | "INVENTORY_STRATEGY"
  | "GENERAL_BUSINESS"
  // fallback
  | "UNKNOWN";

export function detectIntent(text: string): Intent {
  const U = clean(text).toUpperCase();
  if (!U) return "UNKNOWN";

  // Troubleshooting / errors
  if (
    has(U, [
      "ERROR",
      "BUG",
      "CRASH",
      "HAIFANYI",
      "IMEGOMA",
      "INAGOMA",
      "INAFAIL",
      "REJECTED",
      "PUSH",
      "GIT",
      "EXPO",
      "BUILD",
      "ANDROID",
      "IOS",
    ])
  ) {
    return "TROUBLESHOOTING";
  }

  if (
    has(U, [
      "ONBOARD",
      "BUSINESS SETUP",
      "CREATE ACCOUNT",
      "REGISTER",
      "SIGN UP",
      "KUANZISHA",
      "KUSIGNUP",
      "ACCOUNT",
    ])
  ) {
    return "APP_ONBOARDING";
  }

  if (
    has(U, [
      "OPEN STORE",
      "CREATE STORE",
      "ADD STORE",
      "FUNGUA STORE",
      "FUNGUA DUKA",
      "ONGEZA STORE",
      "ONGEZA DUKA",
    ])
  ) {
    return "OPEN_STORE";
  }

  if (
    has(U, [
      "ADD PRODUCT",
      "CREATE PRODUCT",
      "ONGEZA BIDHAA",
      "WEKA BIDHAA",
      "SKU",
      "PRODUCTS",
    ])
  ) {
    return "ADD_PRODUCT";
  }

  if (has(U, ["OFFLINE", "QUEUE", "SYNC", "MTANDAO DUNI", "HAIPO INTERNET"])) {
    return "SALES_OFFLINE";
  }

  if (has(U, ["RECEIPT", "RISITI", "PRINT", "SHARE"])) {
    return "SALES_RECEIPT";
  }

  if (has(U, ["HISTORY", "MAUZO YA ZAMANI", "SALES HISTORY", "TRANSACTIONS"])) {
    return "SALES_HISTORY";
  }

  if (has(U, ["STAFF", "WAFANYAKAZI", "ADD STAFF", "ASSIGN", "ROLE", "ADMIN", "OWNER"])) {
    return "STAFF";
  }

  if (has(U, ["INBOX", "MESSAGE", "UJUMBE", "CHAT", "DM"])) {
    return "INBOX";
  }

  if (has(U, ["CLUB", "POST", "CREATE POST", "TANGAZO", "UPLOAD", "PICHA"])) {
    return "CLUB_CREATE_POST";
  }

  if (has(U, ["ORDER", "AGIZO", "CUSTOMER", "MTEJA"])) {
    return "CLUB_ORDERS";
  }

  if (has(U, ["CREDIT", "DENI", "DEBT", "WALLET"])) {
    return "CREDIT";
  }

  // Business-specific intents (route to BUSINESS brain)
  if (has(U, ["PRICE", "PRICING", "BEI", "DISCOUNT", "MARGIN", "FAIDA", "PROFIT"])) {
    return "PRICING";
  }

  if (has(U, ["MARKETING", "PROMO", "AD", "TANGAZA", "BRAND", "CONTENT", "FUNNEL"])) {
    return "MARKETING";
  }

  if (has(U, ["OPERATIONS", "PROCESS", "SOP", "UTARATIBU", "WORKFLOW", "SYSTEM"])) {
    return "OPERATIONS";
  }

  if (has(U, ["CASHFLOW", "BAJETI", "BUDGET", "FINANCE", "MAPATO", "MATUMIZI"])) {
    return "FINANCE";
  }

  if (has(U, ["STOCK PLAN", "REORDER", "MIN MAX", "SAFETY STOCK", "INVENTORY STRATEGY"])) {
    return "INVENTORY_STRATEGY";
  }

  if (
    has(U, [
      "BUSINESS",
      "IDEA",
      "STRATEGY",
      "MWELEKEO",
      "WAZO",
      "BIASHARA",
    ])
  ) {
    return "GENERAL_BUSINESS";
  }

  return "UNKNOWN";
}

/** --- Structured output (INTEL CORE) --- */

type DepthOpts = { proDepth?: boolean };

function titleLineSW(intent: Intent) {
  switch (intent) {
    case "APP_ONBOARDING":
      return "Onboarding ya ZETRA BMS";
    case "OPEN_STORE":
      return "Kuongeza Store";
    case "ADD_PRODUCT":
      return "Kuongeza Bidhaa";
    case "SALES_OFFLINE":
      return "Offline-first Sales (Queue + Sync)";
    case "SALES_RECEIPT":
      return "Receipts (Online vs Offline)";
    case "SALES_HISTORY":
      return "Sales History";
    case "STAFF":
      return "Staff Management (Owner/Admin)";
    case "CLUB_CREATE_POST":
      return "Business Club — Create Post";
    case "CLUB_ORDERS":
      return "Business Club — Orders";
    case "INBOX":
      return "Inbox / Messages";
    case "CREDIT":
      return "Credit / Deni";
    case "TROUBLESHOOTING":
      return "Troubleshooting";
    default:
      return "ZETRA AI";
  }
}

function titleLineEN(intent: Intent) {
  switch (intent) {
    case "APP_ONBOARDING":
      return "ZETRA BMS Onboarding";
    case "OPEN_STORE":
      return "Add a Store";
    case "ADD_PRODUCT":
      return "Add a Product";
    case "SALES_OFFLINE":
      return "Offline-first Sales (Queue + Sync)";
    case "SALES_RECEIPT":
      return "Receipts (Online vs Offline)";
    case "SALES_HISTORY":
      return "Sales History";
    case "STAFF":
      return "Staff Management (Owner/Admin)";
    case "CLUB_CREATE_POST":
      return "Business Club — Create Post";
    case "CLUB_ORDERS":
      return "Business Club — Orders";
    case "INBOX":
      return "Inbox / Messages";
    case "CREDIT":
      return "Credit / Debt";
    case "TROUBLESHOOTING":
      return "Troubleshooting";
    default:
      return "ZETRA AI";
  }
}

function ctxLineSW(ctx: PlayContext) {
  const org = ctx.activeOrgName ? `Org: ${ctx.activeOrgName}` : "Org: —";
  const store = ctx.activeStoreName ? `Store: ${ctx.activeStoreName}` : "Store: —";
  const role = ctx.activeRole ? `Role: ${ctx.activeRole}` : "Role: —";
  return `${org} • ${store} • ${role}`;
}

function ctxLineEN(ctx: PlayContext) {
  const org = ctx.activeOrgName ? `Org: ${ctx.activeOrgName}` : "Org: —";
  const store = ctx.activeStoreName ? `Store: ${ctx.activeStoreName}` : "Store: —";
  const role = ctx.activeRole ? `Role: ${ctx.activeRole}` : "Role: —";
  return `${org} • ${store} • ${role}`;
}

function bullet(lines: string[]) {
  return lines.map((x) => `• ${x}`).join("\n");
}

function steps(lines: string[]) {
  return lines.map((x, i) => `${i + 1}) ${x}`).join("\n");
}

function section(label: string, body: string) {
  return `${label}\n${body}`;
}

function shapeSW(args: {
  intent: Intent;
  ctx: PlayContext;
  summary: string;
  steps: string[];
  avoid?: string[];
  ask?: string[];
  proAdd?: string[];
  proDepth?: boolean;
}) {
  const { intent, ctx, summary, steps: st, avoid, ask, proAdd, proDepth } = args;

  const parts: string[] = [];
  parts.push(`**${titleLineSW(intent)}**`);
  parts.push(ctxLineSW(ctx));
  parts.push("");
  parts.push(section("Kwa kifupi:", summary));
  parts.push("");
  parts.push(section("Hatua kwa hatua:", steps(st)));

  if (avoid && avoid.length) {
    parts.push("");
    parts.push(section("Makosa ya kuepuka:", bullet(avoid)));
  }

  // PRO depth adds deeper checklist/options
  if (proDepth && proAdd && proAdd.length) {
    parts.push("");
    parts.push(section("PRO (Owner/Admin) — kuongeza ubora:", bullet(proAdd)));
  }

  if (ask && ask.length) {
    parts.push("");
    parts.push(section("Nikuulize haraka:", bullet(ask)));
  }

  return parts.join("\n");
}

function shapeEN(args: {
  intent: Intent;
  ctx: PlayContext;
  summary: string;
  steps: string[];
  avoid?: string[];
  ask?: string[];
  proAdd?: string[];
  proDepth?: boolean;
}) {
  const { intent, ctx, summary, steps: st, avoid, ask, proAdd, proDepth } = args;

  const parts: string[] = [];
  parts.push(`**${titleLineEN(intent)}**`);
  parts.push(ctxLineEN(ctx));
  parts.push("");
  parts.push(section("In short:", summary));
  parts.push("");
  parts.push(section("Step-by-step:", steps(st)));

  if (avoid && avoid.length) {
    parts.push("");
    parts.push(section("Common mistakes to avoid:", bullet(avoid)));
  }

  if (proDepth && proAdd && proAdd.length) {
    parts.push("");
    parts.push(section("PRO (Owner/Admin) — upgrade:", bullet(proAdd)));
  }

  if (ask && ask.length) {
    parts.push("");
    parts.push(section("Quick questions:", bullet(ask)));
  }

  return parts.join("\n");
}

/** --- Playbook responses --- */

export function swResponse(intent: Intent, ctx: PlayContext, _text: string, opts?: DepthOpts): string {
  const proDepth = opts?.proDepth ?? isOwnerOrAdmin(ctx.activeRole);

  switch (intent) {
    case "APP_ONBOARDING":
      return shapeSW({
        intent,
        ctx,
        summary:
          "Unatengeneza account, unaweka Business Setup + First Store Setup, kisha app inaita DB RPC `create_org_with_store` na unaingia dashboard.",
        steps: [
          "Create Account / Login",
          "Onboarding: Business Setup (jina la biashara — DB ita-store UPPERCASE)",
          "Onboarding: First Store Setup (jina la store)",
          "App inaita `create_org_with_store(business_name, first_store_name)`",
          "Uki-OK unaingia Dashboard na Org/Store zinabaki active",
        ],
        avoid: [
          "Kujaribu ku-create org/store kwa direct inserts — onboarding ni kupitia RPC (katiba)",
          "Kusave secrets kwenye repo (.env) — tumelinda hilo",
        ],
        proAdd: [
          "Ongeza ‘defaults’ (currency/timezone/country) bila kuvunja schema",
          "Ongeza ‘post-onboarding checklist’ (add products → stock → first sale)",
        ],
        ask: ["Unakwama step gani hasa? (Business setup au Store setup)"],
        proDepth,
      });

    case "OPEN_STORE":
      return shapeSW({
        intent,
        ctx,
        summary: "Unaongeza store mpya ndani ya org yako, kisha una-assign staff kwa store hiyo.",
        steps: [
          "Nenda tab ya Stores",
          "Bonyeza Add/New Store",
          "Weka jina la store + optional details",
          "Save",
          "Kama kuna staff, wa-assign store access (org_membership_stores)",
        ],
        avoid: ["Kusahau ku-assign staff store access kisha staff aone tupu", "Kuchanganya store za org tofauti"],
        proAdd: ["Ongeza store types (branch/warehouse) kwa UI metadata", "Weka store naming standard: ‘AREA – TYPE’"],
        ask: ["Unataka store iwe Branch au Warehouse?"],
        proDepth,
      });

    case "ADD_PRODUCT":
      return shapeSW({
        intent,
        ctx,
        summary: "Unaongeza bidhaa kwa catalog, kisha inventory inaingia per-store kupitia stock/adjust.",
        steps: [
          "Nenda tab ya Products",
          "Add Product",
          "Jaza: Name, SKU (optional), Selling Price, Unit (optional)",
          "Save",
          "Nenda Inventory/Adjust Stock kuweka quantity kwa store husika",
        ],
        avoid: ["Kuweka SKU duplicates bila mpangilio", "Kusahau kuweka stock store husika baada ya ku-add product"],
        proAdd: ["Standardize SKU (prefix ya org/store)", "Ongeza ‘price tiers’ baadaye (retail/wholesale)"],
        ask: ["Bidhaa zako zinahitaji units gani? (pcs/box/kg)"],
        proDepth,
      });

    case "SALES_OFFLINE":
      return shapeSW({
        intent,
        ctx,
        summary: "Ukiwa offline, mauzo yanaingia queue. Mtandao ukirudi, background sync inasafirisha data salama kwenda DB.",
        steps: [
          "User ana-create sale hata bila internet",
          "Sale inaingia local queue (pending)",
          "Receipt ya offline inaonyesha item names/sku/unit (local payload)",
          "Mtandao ukirudi, sync inatuma (product_id, qty, unit_price) kwenda DB",
          "DB ina-apply stock adjustments safely",
        ],
        avoid: ["Kuruhusu duplicate sync bila idempotency", "Kutegemea network kwa UX — offline inapaswa kuwa primary"],
        proAdd: ["Ongeza retry strategy (exponential backoff)", "Ongeza sync status UI (Pending/Syncing/Synced/Failed)"],
        ask: ["Unataka kuboresha nini zaidi: kasi, reliability, au UX ya sync?"],
        proDepth,
      });

    case "SALES_RECEIPT":
      return shapeSW({
        intent,
        ctx,
        summary: "Receipts zipo aina mbili: online (DB) na offline (local) — zote ziwe consistent kwa customer.",
        steps: [
          "Online receipt: hutokea baada ya sale kuingia DB",
          "Offline receipt: hutokea kabla ya sync (local)",
          "Share/Print huja baadaye kama PRO feature",
        ],
        avoid: ["Kutofautisha bei/majina kati ya offline na online", "Kukosa store branding standard"],
        proAdd: ["Ongeza PDF share + store branding", "Ongeza ‘Customer copy’ / ‘Store copy’ toggle"],
        ask: ["Unataka receipt iwe na logo + contacts za store?"],
        proDepth,
      });

    case "SALES_HISTORY":
      return shapeSW({
        intent,
        ctx,
        summary: "Sales History inaonyesha DB sales + pending offline queue, kwa filters (Today/Week/Month).",
        steps: [
          "Chagua range (Today/7 Days/30 Days)",
          "Angalia list ya sales",
          "Pending ikibofwa inafungua offline receipt",
          "Synced inaonyesha details za DB",
        ],
        avoid: ["Kujaza list bila pagination", "Kukosa caching/memoization kisha UI kuwa nzito"],
        proAdd: ["Ongeza pagination + search", "Ongeza export (CSV/PDF) kwa PRO baadaye"],
        ask: ["Unataka search iwe kwa SKU, name, au receipt no?"],
        proDepth,
      });

    case "STAFF":
      return shapeSW({
        intent,
        ctx,
        summary: "Owner/Admin huongeza staff na ku-assign store(s). Staff hawana access ya profit na hawasimamii subscription.",
        steps: [
          "Nenda tab ya Staff",
          "Add staff (user_id/email kulingana na flow yako)",
          "Weka role (admin/staff)",
          "Assign staff kwa store moja au zaidi",
          "Verify staff anaona only stores alizo-assigniwa",
        ],
        avoid: ["Kumpa staff access ya profit (katiba: owner-only profit)", "Kusahau assign store access"],
        proAdd: ["Ongeza permissions matrix (posts/inbox/orders) kwa Club", "Ongeza audit log (nani alibadilisha nini)"],
        ask: ["Staff wako wafanye nini ndani ya Club? (posts/inbox/orders)"],
        proDepth,
      });

    case "CLUB_CREATE_POST":
      return shapeSW({
        intent,
        ctx,
        summary: "Create post: chagua product, andika caption, optional picha, kisha post inaonekana public kwenye mini-store.",
        steps: [
          "Club tab → Create",
          "Chagua Product (required)",
          "Andika caption (short + clear)",
          "Optional: weka picha (compressed HQ)",
          "Post",
        ],
        avoid: ["Kupakia picha kubwa bila compression", "Kutokuwa na caption yenye CTA (bei/whatsapp/link)"],
        proAdd: ["Ongeza ‘posting schedule’ (best times)", "Ongeza templates za captions kwa categories"],
        ask: ["Unataka post iwe na price visible au ‘DM for price’?"],
        proDepth,
      });

    case "CLUB_ORDERS":
      return shapeSW({
        intent,
        ctx,
        summary: "Orders flow: customer ana-order, store ina-confirm, na confirm inaweza kupunguza stock (v2).",
        steps: [
          "Customer ana-create order kutoka post/store",
          "Inbox/order list inaonyesha pending",
          "Store ina-confirm/decline",
          "Confirm → reduce stock (v2 verified)",
          "Update status mpaka delivered",
        ],
        avoid: ["Confirm bila stock check", "Kuto-lock day kama unatumia closing locks"],
        proAdd: ["Ongeza SLA timers (pending too long)", "Ongeza auto-message templates kwa inbox"],
        ask: ["Unataka order iwe delivery au pickup default?"],
        proDepth,
      });

    case "INBOX":
      return shapeSW({
        intent,
        ctx,
        summary: "Inbox ni mawasiliano ya customer ↔ store, staff wanaweza kusimamia bila kugusa store profile/catalog (katiba).",
        steps: [
          "Fungua Club → Inbox",
          "Jibu message kwa templates (bei, availability, delivery)",
          "Badilisha status ya order kama ipo",
          "Escalate kwa owner/admin kama inahitaji maamuzi makubwa",
        ],
        avoid: ["Staff kubadilisha store profile/catalog (hairuhusiwi)", "Kutokuwa na templates kisha response kuwa slow"],
        proAdd: ["Ongeza quick replies + labels (hot lead/paid/pending)", "Ongeza inbox assignment (staff A/B)"],
        ask: ["Unataka templates ziwe Kiswahili tu au MIX?"],
        proDepth,
      });

    case "CREDIT":
      return shapeSW({
        intent,
        ctx,
        summary: "Credit module bora ni ledger (transactions) ili ujue deni, malipo, due dates na history ya customer.",
        steps: [
          "Chagua model: per-customer au per-order",
          "Tengeneza ledger entries (principal, payments, adjustments)",
          "Onyesha outstanding balance + due dates",
          "Weka reminders/notifications baadaye",
        ],
        avoid: ["Kuweka deni kama ‘number’ bila history", "Kuchanganya org/store bila boundaries"],
        proAdd: ["Ongeza statements (PDF)", "Ongeza limits + approvals (admin/owner only)"],
        ask: ["Unataka credit iwe per-customer au per-order?"],
        proDepth,
      });

    case "TROUBLESHOOTING":
      return shapeSW({
        intent,
        ctx,
        summary: "Tuna-triage: (1) nini kilibadilika, (2) error ni wapi, (3) step ya ku-reproduce, (4) fix ndogo bila kuvunja features.",
        steps: [
          "Nipe exact error text (1 screenshot au copy)",
          "Niambie ulifanya change gani kabla ya error",
          "Thibitisha route/file inayohusika",
          "Tunaweka fix ya minimal (additive) bila ku-break stable checkpoints",
        ],
        avoid: ["Kufanya refactor kubwa wakati tuna-debug issue moja", "Kufuta tables/functions bila sababu"],
        proAdd: ["Ongeza small diagnostic checklist per module", "Ongeza crash boundary/logging (later)"],
        ask: ["Error inatokea kwenye screen gani? na baada ya action gani?"],
        proDepth,
      });

    // Business intents routed to BUSINESS brain, but if they land here, give a safe bridge:
    case "PRICING":
    case "MARKETING":
    case "OPERATIONS":
    case "FINANCE":
    case "INVENTORY_STRATEGY":
    case "GENERAL_BUSINESS":
      return shapeSW({
        intent: "GENERAL_BUSINESS",
        ctx,
        summary:
          "Nipe details 2–3 (aina ya biashara, bidhaa kuu, na target customer) kisha nitakupa mpango wa wiki 2–4 wenye hatua za kuongeza mauzo + faida.",
        steps: [
          "Taja aina ya biashara (retail/wholesale/service)",
          "Taja bidhaa 3 zinazouza zaidi",
          "Taja bei range (low/mid/high) na location",
          "Nitarudisha plan: pricing + stock + marketing + ops",
        ],
        avoid: ["Kufanya promo bila kujua margin", "Kukosa stock ya best-sellers"],
        proAdd: ["Nitatoa Options A/B/C + tradeoffs", "Nitatoa checklist ya utekelezaji (7 days / 30 days)"],
        ask: ["Biashara yako ni ya aina gani? na bidhaa top 3 ni zipi?"],
        proDepth,
      });

    default:
      return shapeSW({
        intent: "UNKNOWN",
        ctx,
        summary: "Niambie unataka msaada wa ZETRA (how-to) au ushauri wa biashara (strategy).",
        steps: [
          "Chagua: A) How-to ZETRA BMS, au B) Business advice",
          "Andika swali kwa Kiswahili au English",
          "Nitakuongoza hatua kwa hatua",
        ],
        ask: ["Unataka A au B?"],
        proDepth,
      });
  }
}

export function enResponse(intent: Intent, ctx: PlayContext, _text: string, opts?: DepthOpts): string {
  const proDepth = opts?.proDepth ?? isOwnerOrAdmin(ctx.activeRole);

  switch (intent) {
    case "APP_ONBOARDING":
      return shapeEN({
        intent,
        ctx,
        summary:
          "Create an account, complete Business Setup + First Store Setup, then the app calls DB RPC `create_org_with_store` and you land on the dashboard.",
        steps: [
          "Create Account / Login",
          "Onboarding: Business Setup (business name — stored UPPERCASE in DB)",
          "Onboarding: First Store Setup (store name)",
          "App calls `create_org_with_store(business_name, first_store_name)`",
          "On success you enter Dashboard with active Org/Store",
        ],
        avoid: [
          "Direct DB inserts for org/store — onboarding is via RPC (constitution)",
          "Committing secrets to GitHub (.env) — keep secrets protected",
        ],
        proAdd: [
          "Add safe defaults (currency/timezone/country) without schema changes",
          "Add a post-onboarding checklist (products → stock → first sale)",
        ],
        ask: ["Which step are you stuck on (Business setup or Store setup)?"],
        proDepth,
      });

    case "OPEN_STORE":
      return shapeEN({
        intent,
        ctx,
        summary: "Add a new store inside your org, then assign staff access to that store.",
        steps: [
          "Go to Stores tab",
          "Tap Add/New Store",
          "Enter name + optional details",
          "Save",
          "Assign staff to store(s) (org_membership_stores)",
        ],
        avoid: ["Forgetting staff-store assignment (staff sees empty)", "Mixing stores across orgs"],
        proAdd: ["Add store types (branch/warehouse) as UI metadata", "Use naming standard: ‘AREA – TYPE’"],
        ask: ["Is this store a Branch or a Warehouse?"],
        proDepth,
      });

    case "ADD_PRODUCT":
      return shapeEN({
        intent,
        ctx,
        summary: "Add a product to catalog, then stock it per store via inventory/adjust.",
        steps: [
          "Go to Products tab",
          "Add Product",
          "Fill: Name, SKU (optional), Selling Price, Unit (optional)",
          "Save",
          "Go to Inventory/Adjust Stock to set quantity for the active store",
        ],
        avoid: ["Random SKU duplicates", "Adding products but never stocking them for a store"],
        proAdd: ["Standardize SKU (org/store prefix)", "Later add price tiers (retail/wholesale)"],
        ask: ["Which units do you use (pcs/box/kg)?"],
        proDepth,
      });

    case "SALES_OFFLINE":
      return shapeEN({
        intent,
        ctx,
        summary:
          "When offline, sales go into a local queue. When online returns, background sync safely sends data to DB.",
        steps: [
          "Create a sale even without internet",
          "Sale is stored in local queue (pending)",
          "Offline receipt uses local payload (name/sku/unit)",
          "When online, sync sends (product_id, qty, unit_price) to DB",
          "DB applies stock adjustments safely",
        ],
        avoid: ["Duplicate syncing without idempotency", "Network-dependent UX (offline must be primary)"],
        proAdd: ["Retry strategy (exponential backoff)", "Sync status UI (Pending/Syncing/Synced/Failed)"],
        ask: ["What should we improve first: speed, reliability, or sync UI?"],
        proDepth,
      });

    case "SALES_RECEIPT":
      return shapeEN({
        intent,
        ctx,
        summary: "Two receipt modes: online (DB) and offline (local) — keep them consistent for customers.",
        steps: [
          "Online receipt: after DB sync",
          "Offline receipt: before sync (local)",
          "Share/Print comes later as PRO option",
        ],
        avoid: ["Price/name mismatch between offline and online", "No branding standard"],
        proAdd: ["PDF share + branding", "Customer copy / Store copy toggle"],
        ask: ["Do you want logo + store contacts on receipts?"],
        proDepth,
      });

    case "SALES_HISTORY":
      return shapeEN({
        intent,
        ctx,
        summary: "Sales History shows DB sales + pending offline queue, with range filters.",
        steps: ["Select range (Today/7 Days/30 Days)", "View sales list", "Open pending for offline receipt", "Open synced for DB details"],
        avoid: ["No pagination", "Heavy UI without caching/memoization"],
        proAdd: ["Pagination + search", "Export (CSV/PDF) later for PRO"],
        ask: ["Search by SKU, name, or receipt number?"],
        proDepth,
      });

    case "STAFF":
      return shapeEN({
        intent,
        ctx,
        summary:
          "Owner/Admin can add staff and assign store access. Staff cannot see profit and cannot manage subscription.",
        steps: [
          "Go to Staff tab",
          "Add staff",
          "Set role (admin/staff)",
          "Assign stores",
          "Verify staff sees only assigned stores",
        ],
        avoid: ["Giving staff profit visibility (owner-only profit)", "Forgetting store assignment"],
        proAdd: ["Club permissions matrix (posts/inbox/orders)", "Audit log (who changed what)"],
        ask: ["What should staff manage in Club (posts/inbox/orders)?"],
        proDepth,
      });

    case "CLUB_CREATE_POST":
      return shapeEN({
        intent,
        ctx,
        summary: "Create post: pick product, write caption, optional image, publish to public mini-store.",
        steps: ["Club tab → Create", "Pick Product", "Write caption", "Optional HQ image (compressed)", "Post"],
        avoid: ["Huge images without compression", "No CTA in caption"],
        proAdd: ["Posting schedule (best times)", "Caption templates by category"],
        ask: ["Show price publicly or ‘DM for price’?"],
        proDepth,
      });

    case "CLUB_ORDERS":
      return shapeEN({
        intent,
        ctx,
        summary: "Orders flow: customer orders, store confirms, confirm can reduce stock (v2).",
        steps: ["Customer creates order", "Store sees pending", "Confirm/decline", "Confirm reduces stock (v2)", "Update status to delivered"],
        avoid: ["Confirm without stock check", "Ignoring closing locks rules (if enabled)"],
        proAdd: ["SLA timers", "Auto-message templates for inbox"],
        ask: ["Default delivery or pickup?"],
        proDepth,
      });

    case "INBOX":
      return shapeEN({
        intent,
        ctx,
        summary: "Inbox handles customer ↔ store messages. Staff can manage inbox/orders but not store profile/catalog.",
        steps: ["Open Club → Inbox", "Reply with templates", "Update order status if needed", "Escalate to owner/admin for major decisions"],
        avoid: ["Staff editing store profile/catalog", "No templates → slow responses"],
        proAdd: ["Quick replies + labels", "Inbox assignment (staff A/B)"],
        ask: ["Templates in Swahili only or MIX?"],
        proDepth,
      });

    case "CREDIT":
      return shapeEN({
        intent,
        ctx,
        summary: "A proper credit module is a transaction ledger (not just a number): balance, payments, due dates, history.",
        steps: ["Choose model: per-customer or per-order", "Create ledger entries (principal, payments, adjustments)", "Show outstanding + due dates", "Add reminders later"],
        avoid: ["Storing debt as a single number without history", "Mixing org/store boundaries"],
        proAdd: ["Statements (PDF)", "Limits + approvals (admin/owner only)"],
        ask: ["Credit per customer or per order?"],
        proDepth,
      });

    case "TROUBLESHOOTING":
      return shapeEN({
        intent,
        ctx,
        summary: "We triage: what changed, where the error is, steps to reproduce, then minimal fix without breaking stable checkpoints.",
        steps: ["Send exact error text (screenshot or copy)", "Tell me what changed before it started", "Confirm screen/route involved", "Apply minimal additive fix"],
        avoid: ["Big refactors while debugging one issue", "Deleting DB objects unnecessarily"],
        proAdd: ["Module diagnostic checklist", "Crash boundary/logging later"],
        ask: ["Which screen + which action triggers it?"],
        proDepth,
      });

    // Business intents routed to BUSINESS brain, but safe fallback:
    case "PRICING":
    case "MARKETING":
    case "OPERATIONS":
    case "FINANCE":
    case "INVENTORY_STRATEGY":
    case "GENERAL_BUSINESS":
      return shapeEN({
        intent: "GENERAL_BUSINESS",
        ctx,
        summary:
          "Give me 2–3 details (business type, top products, target customer) and I’ll produce a 2–4 week action plan to increase sales and profit.",
        steps: [
          "State business type (retail/wholesale/service)",
          "List top 3 products",
          "Share price range + location",
          "I return: pricing + stock + marketing + ops plan",
        ],
        avoid: ["Running promos without knowing margin", "Stockouts on best sellers"],
        proAdd: ["Options A/B/C with tradeoffs", "Execution checklist (7 days / 30 days)"],
        ask: ["Business type? and top 3 products?"],
        proDepth,
      });

    default:
      return shapeEN({
        intent: "UNKNOWN",
        ctx,
        summary: "Tell me if you want ZETRA how-to guidance or business strategy advice.",
        steps: ["Choose: A) ZETRA how-to, or B) Business advice", "Type in Swahili or English", "I’ll guide you step-by-step"],
        ask: ["A or B?"],
        proDepth,
      });
  }
}

/**
 * Single entry helper:
 * - Detect intent
 * - Return SW/EN/MIX response
 */
export function responseFor(
  lang: "SW" | "EN" | "MIX",
  ctx: PlayContext,
  text: string
): string {
  const intent = detectIntent(text);

  if (lang === "SW") return swResponse(intent, ctx, text);
  if (lang === "EN") return enResponse(intent, ctx, text);

  const sw = swResponse(intent, ctx, text);
  const en = enResponse(intent, ctx, text);
  return `🇹🇿 Kiswahili:\n${sw}\n\n🇬🇧 English:\n${en}`;
}