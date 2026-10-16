import type {Language} from '../i18n/catalog';
const languages:Language[]=['en','sw','fr','pt','ar','es','zh'];
const rows = {
  "invoice": [
    "PROFORMA INVOICE",
    "ANKARA YA PROFORMA",
    "FACTURE PRO FORMA",
    "FATURA PROFORMA",
    "فاتورة أولية",
    "FACTURA PROFORMA",
    "形式发票"
  ],
  "notProof": [
    "THIS DOCUMENT IS NOT PROOF OF PAYMENT.",
    "HATI HII SI UTHIBITISHO WA MALIPO.",
    "CE DOCUMENT NE CONSTITUE PAS UNE PREUVE DE PAIEMENT.",
    "ESTE DOCUMENTO NÃO É COMPROVANTE DE PAGAMENTO.",
    "هذا المستند ليس إثباتًا للدفع.",
    "ESTE DOCUMENTO NO ES UN COMPROBANTE DE PAGO.",
    "本文件不作为付款凭证。"
  ],
  "unpaid": [
    "UNPAID · AWAITING PAYMENT",
    "HAIJALIPWA · INASUBIRI MALIPO",
    "IMPAYÉE · EN ATTENTE DE PAIEMENT",
    "NÃO PAGA · AGUARDANDO PAGAMENTO",
    "غير مدفوعة · بانتظار الدفع",
    "SIN PAGAR · PENDIENTE DE PAGO",
    "未付款 · 等待付款"
  ],
  "reference": [
    "Reference",
    "Kumbukumbu",
    "Référence",
    "Referência",
    "المرجع",
    "Referencia",
    "编号"
  ],
  "revision": [
    "Revision",
    "Toleo",
    "Révision",
    "Revisão",
    "الإصدار",
    "Revisión",
    "版本"
  ],
  "issued": [
    "Issued",
    "Imetolewa",
    "Émise le",
    "Emitida em",
    "تاريخ الإصدار",
    "Emitida",
    "开具日期"
  ],
  "validity": [
    "Valid until",
    "Halali hadi",
    "Valable jusqu’au",
    "Válida até",
    "صالحة حتى",
    "Válida hasta",
    "有效期至"
  ],
  "customer": [
    "Customer",
    "Mteja",
    "Client",
    "Cliente",
    "العميل",
    "Cliente",
    "客户"
  ],
  "item": [
    "Item",
    "Bidhaa",
    "Article",
    "Item",
    "الصنف",
    "Artículo",
    "商品"
  ],
  "quantity": [
    "Quantity",
    "Kiasi",
    "Quantité",
    "Quantidade",
    "الكمية",
    "Cantidad",
    "数量"
  ],
  "price": [
    "Unit price",
    "Bei ya kipimo",
    "Prix unitaire",
    "Preço unitário",
    "سعر الوحدة",
    "Precio unitario",
    "单价"
  ],
  "discount": [
    "Discount",
    "Punguzo",
    "Remise",
    "Desconto",
    "الخصم",
    "Descuento",
    "折扣"
  ],
  "subtotal": [
    "Subtotal",
    "Jumla ndogo",
    "Sous-total",
    "Subtotal",
    "المجموع الفرعي",
    "Subtotal",
    "小计"
  ],
  "total": [
    "Grand total",
    "Jumla kuu",
    "Total général",
    "Total geral",
    "الإجمالي",
    "Total general",
    "总计"
  ],
  "notes": [
    "Notes",
    "Maelezo",
    "Notes",
    "Observações",
    "ملاحظات",
    "Notas",
    "备注"
  ],
  "terms": [
    "Terms",
    "Masharti",
    "Conditions",
    "Condições",
    "الشروط",
    "Condiciones",
    "条款"
  ],
  "expires": [
    "Reservation expires",
    "Uhifadhi unaisha",
    "La réservation expire",
    "A reserva expira",
    "انتهاء الحجز",
    "La reserva vence",
    "预留到期时间"
  ],
  "paymentInstructions": [
    "Payment instructions",
    "Maelekezo ya malipo",
    "Instructions de paiement",
    "Instruções de pagamento",
    "تعليمات الدفع",
    "Instrucciones de pago",
    "付款说明"
  ],
  "amount": [
    "Amount",
    "Thamani",
    "Montant",
    "Valor",
    "المبلغ",
    "Importe",
    "金额"
  ],
  "tax": [
    "Tax",
    "Kodi",
    "Taxe",
    "Imposto",
    "الضريبة",
    "Impuesto",
    "税费"
  ],
  "registration": [
    "Registration number",
    "Namba ya usajili",
    "Numéro d’immatriculation",
    "Número de registro",
    "رقم التسجيل",
    "Número de registro",
    "注册号"
  ],
  "share": [
    "Share Proforma PDF",
    "Shiriki PDF ya Proforma",
    "Partager la pro forma PDF",
    "Compartilhar PDF da proforma",
    "مشاركة الفاتورة الأولية PDF",
    "Compartir PDF de proforma",
    "分享形式发票 PDF"
  ],
  "orders": [
    "Proforma Orders",
    "Maagizo ya Proforma",
    "Commandes pro forma",
    "Pedidos proforma",
    "طلبات الفواتير الأولية",
    "Pedidos proforma",
    "形式发票订单"
  ],
  "search": [
    "Search reference or customer",
    "Tafuta kumbukumbu au mteja",
    "Rechercher référence ou client",
    "Buscar referência ou cliente",
    "البحث بالمرجع أو العميل",
    "Buscar referencia o cliente",
    "搜索编号或客户"
  ],
  "empty": [
    "No matching Proformas",
    "Hakuna Proforma zinazolingana",
    "Aucune pro forma correspondante",
    "Nenhuma proforma encontrada",
    "لا توجد فواتير أولية مطابقة",
    "No hay proformas coincidentes",
    "没有匹配的形式发票"
  ],
  "loading": [
    "Preparing preview…",
    "Inaandaa onyesho…",
    "Préparation de l’aperçu…",
    "Preparando prévia…",
    "جارٍ إعداد المعاينة…",
    "Preparando vista previa…",
    "正在准备预览…"
  ],
  "back": [
    "Back",
    "Rudi",
    "Retour",
    "Voltar",
    "رجوع",
    "Volver",
    "返回"
  ],
  "view": [
    "View details",
    "Angalia taarifa",
    "Voir les détails",
    "Ver detalhes",
    "عرض التفاصيل",
    "Ver detalles",
    "查看详情"
  ],
  "status": [
    "Document status",
    "Hali ya hati",
    "Statut du document",
    "Estado do documento",
    "حالة المستند",
    "Estado del documento",
    "单据状态"
  ],
  "pending": [
    "Pending",
    "Inasubiri",
    "En attente",
    "Pendente",
    "قيد الانتظار",
    "Pendiente",
    "待处理"
  ],
  "expired": [
    "Expired",
    "Imeisha muda",
    "Expirée",
    "Expirada",
    "منتهية الصلاحية",
    "Vencida",
    "已过期"
  ],
  "cancelled": [
    "Cancelled",
    "Imeghairiwa",
    "Annulée",
    "Cancelada",
    "ملغاة",
    "Cancelada",
    "已取消"
  ],
  "draft": [
    "Draft",
    "Rasimu",
    "Brouillon",
    "Rascunho",
    "مسودة",
    "Borrador",
    "草稿"
  ],
  "accepted": [
    "Accepted",
    "Imekubaliwa",
    "Acceptée",
    "Aceita",
    "مقبولة",
    "Aceptada",
    "已接受"
  ],
  "converted": [
    "Converted",
    "Imebadilishwa kuwa mauzo",
    "Convertie",
    "Convertida",
    "تم التحويل",
    "Convertida",
    "已转为销售"
  ],
  "loadFailed": [
    "Could not load Proformas. Try again.",
    "Proforma hazijapakiwa. Jaribu tena.",
    "Impossible de charger les pro formas. Réessayez.",
    "Não foi possível carregar as proformas. Tente novamente.",
    "تعذر تحميل الفواتير الأولية. حاول مجددًا.",
    "No se pudieron cargar las proformas. Inténtelo de nuevo.",
    "无法加载形式发票，请重试。"
  ],
  "exportFailed": [
    "Could not export the document. Try again.",
    "Hati haijatolewa. Jaribu tena.",
    "Impossible d’exporter le document. Réessayez.",
    "Não foi possível exportar o documento. Tente novamente.",
    "تعذر تصدير المستند. حاول مجددًا.",
    "No se pudo exportar el documento. Inténtelo de nuevo.",
    "无法导出单据，请重试。"
  ],
  "retry": [
    "Retry",
    "Jaribu tena",
    "Réessayer",
    "Tentar novamente",
    "إعادة المحاولة",
    "Reintentar",
    "重试"
  ]
} as const;
export type ProformaLabel=keyof typeof rows;
export function proformaText(language:Language,key:ProformaLabel):string{return rows[key][languages.indexOf(language)]??rows[key][0]}
