// Client release exclusions. Enabling server-backed features requires a separately
// approved backend/security package; environment variables cannot override these.
export const RELEASE_FEATURES = Object.freeze({
  accountLifecycle: false,
  proformaSettlement: false,
  stockFundingPosting: false,
  smartPricingPosting: false,
  crossCurrencySettlement: false,
});

const accountUnavailable = {
  en: "Account changes are temporarily unavailable. Your existing account and business records are preserved.",
  sw: "Mabadiliko ya akaunti hayapatikani kwa sasa. Akaunti yako na rekodi za biashara zimehifadhiwa.",
  fr: "Les modifications du compte sont temporairement indisponibles. Votre compte et vos données commerciales sont conservés.",
  pt: "As alterações da conta estão temporariamente indisponíveis. A sua conta e os registos comerciais estão preservados.",
  ar: "تغييرات الحساب غير متاحة مؤقتًا. حسابك وسجلات نشاطك التجاري محفوظة.",
  es: "Los cambios de cuenta no están disponibles temporalmente. Tu cuenta y los registros comerciales se conservan.",
  zh: "账户变更暂不可用。您的现有账户和业务记录均予保留。",
} as const;

export function accountReleaseMessage(language: string): string {
  return accountUnavailable[language as keyof typeof accountUnavailable] ?? accountUnavailable.en;
}
