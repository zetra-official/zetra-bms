export type Role = "owner" | "admin" | "staff" | "cashier";
export type Platform = "android" | "mobile-web" | "desktop-web";
export const KNOWLEDGE_VERSION = "2026-10-14.1";
export const DATABASE_KNOWLEDGE_STATUS = "PARTIAL_CAPTURE";
type Guide = { id: string; title: string; tags: string[]; roles: Role[]; route: string; steps: string[]; verification: string };
// Curated workflow knowledge only. No source bodies, credentials or business rows.
const guides: Guide[] = [
 {id:"pos-sale",title:"Record a sale",tags:["sale","checkout","sell","mauzo","uza","بيع","vente","vendre","venda","vender","venta","البيع","مبيعات","المبيعات","销售"],roles:["owner","cashier"],route:"/(tabs)/sales",steps:["Choose the active store and add the intended products to the cart.","Open Checkout; verify quantities, prices and the payment total.","For a cashier sale, an OPEN shift is required.","Confirm once. If the outcome is unconfirmed, check history before retrying."],verification:"SOURCE_AND_SYNTHETIC_CHECKOUT_RENDER"},
 {id:"offline-sale",title:"Save an offline sale",tags:["offline","queue","retry","mtandao","انترنت","hors ligne","sans connexion","sem conexão","sin conexión","nje ya mtandao","دون اتصال","بدون انترنت","离线"],roles:["owner","cashier"],route:"/(tabs)/sales/history",steps:["In offline checkout, use Save Offline once.","The saved queue record remains available locally until synchronization succeeds.","An interrupted or uncertain sale/credit result requires reconciliation; do not blindly submit it again."],verification:"SOURCE_AND_BROWSER_QUEUE_FIXTURES"},
 {id:"crm-customer",title:"Find a customer safely",tags:["customer","crm","mteja","عميل","client","clients","cliente","clientes","العميل","العملاء","客户"],roles:["owner"],route:"/customers",steps:["Choose the organization and store scope before looking up a customer.","Review candidates and resolve ambiguous identities before requesting customer-specific history."],verification:"SOURCE_AND_SYNTHETIC_CRM_LIBRARY"},
 {id:"financial-report",title:"Understand a financial report",tags:["report","profit","finance","inventory","stock","ripoti","faida","تقرير","مخزون","rapport","bénéfice","relatório","lucro","informe","beneficio","المالية","التقرير","财务","报表","库存"],roles:["owner"],route:"/finance/live",steps:["Verify the organization, store, dates and currency.","Daily sales and expenses are flows; inventory represents each store's latest position.","Repeated snapshots must not double-count totals. Missing or conflicting values require review."],verification:"SOURCE_AND_DETERMINISTIC_METRICS_TESTS"}
];
export function searchGuides(query: string, role: Role, platform: Platform, limit = 3) {
 if (!["owner","admin","staff","cashier"].includes(role) || !["android","mobile-web","desktop-web"].includes(platform)) throw new Error("Invalid guide context");
 if (typeof query !== "string" || !query.trim() || query.length > 512 || !Number.isInteger(limit) || limit < 1 || limit > 4) throw new Error("Invalid guide request");
 const normalized = query.normalize("NFKC").toLowerCase();
 const words = normalized.split(/[\s.,!?؟]+/).filter(Boolean);
 return guides.filter(g => g.roles.includes(role)).map(g => ({g,score:g.tags.filter(tag=>words.some(word=>word===tag) || ((tag.includes(" ") || /\p{Script=Han}/u.test(tag)) && normalized.includes(tag))).length}))
   .filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.g.id.localeCompare(b.g.id)).slice(0,limit)
   .map(({g})=>({...g,version:KNOWLEDGE_VERSION,platform,databaseKnowledge:DATABASE_KNOWLEDGE_STATUS}));
}
