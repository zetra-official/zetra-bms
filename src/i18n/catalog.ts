// Verified against ZETRA WEBSITE/i18n/locales.ts; do not add guessed languages.
export const languages = ['en', 'sw', 'fr', 'pt', 'ar', 'es', 'zh'] as const;
export type Language = typeof languages[number];
export const languageNames: Record<Language, string> = {en:'English',sw:'Kiswahili',fr:'Français',pt:'Português',ar:'العربية',es:'Español',zh:'中文'};
const keys = ['home','sales','pos','expenses','stores','products','credit','recovery','field','history','more','language','save','cancel','loading','search','retry','customers','reports','settings'] as const;
export type MessageKey = typeof keys[number];
const rows: Record<Language, string[]> = {
 en:['Home','Sales','Point of sale','Expenses','Stores','Products','Credit','Recovery','Field','History','More','Language','Save','Cancel','Loading…','Search','Retry','Customers','Reports','Settings'],
 sw:['Nyumbani','Mauzo','Sehemu ya mauzo','Matumizi','Maduka','Bidhaa','Mikopo','Urejeshaji','Shambani','Historia','Zaidi','Lugha','Hifadhi','Ghairi','Inapakia…','Tafuta','Jaribu tena','Wateja','Ripoti','Mipangilio'],
 fr:['Accueil','Ventes','Point de vente','Dépenses','Magasins','Produits','Crédit','Recouvrement','Terrain','Historique','Plus','Langue','Enregistrer','Annuler','Chargement…','Rechercher','Réessayer','Clients','Rapports','Paramètres'],
 pt:['Início','Vendas','Ponto de venda','Despesas','Lojas','Produtos','Crédito','Recuperação','Campo','Histórico','Mais','Idioma','Guardar','Cancelar','A carregar…','Pesquisar','Tentar novamente','Clientes','Relatórios','Definições'],
 ar:['الرئيسية','المبيعات','نقطة البيع','المصروفات','المتاجر','المنتجات','الائتمان','التحصيل','الميدان','السجل','المزيد','اللغة','حفظ','إلغاء','جارٍ التحميل…','بحث','إعادة المحاولة','العملاء','التقارير','الإعدادات'],
 es:['Inicio','Ventas','Punto de venta','Gastos','Tiendas','Productos','Crédito','Recuperación','Campo','Historial','Más','Idioma','Guardar','Cancelar','Cargando…','Buscar','Reintentar','Clientes','Informes','Configuración'],
 zh:['首页','销售','销售点','支出','门店','产品','赊销','回收','外勤','历史记录','更多','语言','保存','取消','加载中…','搜索','重试','客户','报表','设置'],
};
export const dictionaries = Object.fromEntries(languages.map(language => [language,Object.fromEntries(keys.map((key,index)=>[key,rows[language][index]]))])) as Record<Language,Record<MessageKey,string>>;
export function resolveLanguage(value: unknown): Language {
 const code=String(value??'').trim().toLowerCase().split(/[-_]/)[0];
 return languages.includes(code as Language)?code as Language:'en';
}
export function translate(language: Language, key: MessageKey) {
 return dictionaries[language]?.[key] || dictionaries.en[key];
}
export function direction(language: Language): 'rtl'|'ltr' {return language==='ar'?'rtl':'ltr';}
