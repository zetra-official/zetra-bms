import {useLanguage} from "./LanguageProvider";
export const accountCopy={
  "en": {
    "title": "Disable account",
    "explain": "Disabling marks your profile as disabled and signs you out. It does not erase your account or release your email for registration.",
    "unavailable": "Permanent account deletion is not available here. Financial records and organization ownership require a verified account-removal process.",
    "confirm": "Type DISABLE to confirm",
    "done": "Profile disabled",
    "signedout": "Your profile was disabled. Account deletion and same-email registration have not been completed.",
    "failed": "Account could not be disabled"
  },
  "sw": {
    "title": "Zima akaunti",
    "explain": "Kuzima huweka wasifu wako kuwa umezimwa na kukuondoa kwenye kikao. Hakufuti akaunti wala kuruhusu barua pepe kutumiwa kwa usajili mpya.",
    "unavailable": "Ufutaji wa kudumu wa akaunti haupatikani hapa. Rekodi za fedha na umiliki wa shirika zinahitaji utaratibu wa kufuta akaunti uliothibitishwa.",
    "confirm": "Andika DISABLE kuthibitisha",
    "done": "Wasifu umezimwa",
    "signedout": "Wasifu wako umezimwa. Akaunti haijafutwa na usajili kwa barua pepe ileile haujakamilishwa.",
    "failed": "Akaunti haikuweza kuzimwa"
  },
  "fr": {
    "title": "Désactiver le compte",
    "explain": "La désactivation marque votre profil comme désactivé et vous déconnecte. Elle ne supprime pas votre compte et ne libère pas votre adresse e-mail pour une nouvelle inscription.",
    "unavailable": "La suppression définitive du compte est indisponible ici. Les documents financiers et la propriété des organisations exigent une procédure de suppression vérifiée.",
    "confirm": "Saisissez DISABLE pour confirmer",
    "done": "Profil désactivé",
    "signedout": "Votre profil a été désactivé. La suppression du compte et la réinscription avec le même e-mail ne sont pas réalisées.",
    "failed": "Impossible de désactiver le compte"
  },
  "pt": {
    "title": "Desativar conta",
    "explain": "A desativação marca seu perfil como desativado e encerra a sessão. Não apaga sua conta nem libera seu e-mail para um novo cadastro.",
    "unavailable": "A exclusão permanente da conta não está disponível aqui. Os registros financeiros e a propriedade da organização exigem um processo de exclusão verificado.",
    "confirm": "Digite DISABLE para confirmar",
    "done": "Perfil desativado",
    "signedout": "Seu perfil foi desativado. A exclusão da conta e o novo cadastro com o mesmo e-mail não foram realizados.",
    "failed": "Não foi possível desativar a conta"
  },
  "ar": {
    "title": "تعطيل الحساب",
    "explain": "يضع التعطيل علامة على ملفك الشخصي ويسجل خروجك. ولا يحذف حسابك أو يتيح إعادة التسجيل بعنوان بريدك الإلكتروني.",
    "unavailable": "حذف الحساب نهائيًا غير متاح هنا. تتطلب السجلات المالية وملكية المؤسسة إجراء حذف موثوقًا.",
    "confirm": "اكتب DISABLE للتأكيد",
    "done": "تم تعطيل الملف الشخصي",
    "signedout": "تم تعطيل ملفك الشخصي. لم يتم حذف الحساب أو إتاحة إعادة التسجيل بالبريد الإلكتروني نفسه.",
    "failed": "تعذر تعطيل الحساب"
  },
  "es": {
    "title": "Desactivar cuenta",
    "explain": "La desactivación marca tu perfil como desactivado y cierra la sesión. No elimina tu cuenta ni libera tu correo para un nuevo registro.",
    "unavailable": "La eliminación permanente no está disponible aquí. Los registros financieros y la propiedad de la organización requieren un proceso de eliminación verificado.",
    "confirm": "Escribe DISABLE para confirmar",
    "done": "Perfil desactivado",
    "signedout": "Tu perfil fue desactivado. No se han completado la eliminación de la cuenta ni el registro con el mismo correo.",
    "failed": "No se pudo desactivar la cuenta"
  },
  "zh": {
    "title": "停用账户",
    "explain": "停用会将您的个人资料标记为已停用并退出登录，但不会删除账户或释放邮箱用于重新注册。",
    "unavailable": "此处暂不支持永久删除账户。财务记录和组织所有权需要经过验证的账户删除流程。",
    "confirm": "输入 DISABLE 以确认",
    "done": "个人资料已停用",
    "signedout": "您的个人资料已停用，但账户删除及使用相同邮箱重新注册尚未完成。",
    "failed": "无法停用账户"
  }
} as const;
export function useAccountCopy(){const {language}=useLanguage();return (key:keyof typeof accountCopy.en)=>accountCopy[language][key];}
