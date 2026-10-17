import React,{useRef,useState} from 'react';
import { Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { useLanguage } from '../i18n/LanguageProvider';
import { PROFORMA_PERSISTENCE_READY, canOpenProforma, proformaAvailability } from './availability';
import type { Language } from '../i18n/catalog';

export const createInvoiceLabels: Record<Language, string> = {
  en: 'Create Proforma Invoice', sw: 'Unda Ankara ya Proforma', fr: 'Créer une facture pro forma',
  pt: 'Criar fatura proforma', ar: 'إنشاء فاتورة أولية', es: 'Crear factura proforma', zh: '创建形式发票',
};
export function CheckoutProformaAction(props: {
  organizationId: string | null; storeId: string | null; storeOrganizationId: string | null;
  role: string | null; busy: boolean; online: boolean; hasItems: boolean; onOpen: () => void | Promise<void>;
}) {
  const { language } = useLanguage();
  const gate=useRef(false);const[opening,setOpening]=useState(false);const[failed,setFailed]=useState(false);
  const authorized = canOpenProforma(props);
  if (!authorized || props.role === 'cashier') return null;
  // Compile-time gate remains false until exact gateway, pricing and conversion contracts pass.
  const disabled = !PROFORMA_PERSISTENCE_READY || props.busy || opening || !props.online || !props.hasItems;
  async function open(){if(disabled||gate.current)return;gate.current=true;setOpening(true);setFailed(false);try{await props.onOpen()}catch{setFailed(true)}finally{gate.current=false;setOpening(false)}}
  return <View style={{ gap: 6 }}>
    <Button title={createInvoiceLabels[language]} variant="secondary" disabled={disabled} onPress={() => void open()} />
    {!PROFORMA_PERSISTENCE_READY && <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 18 }}>{proformaAvailability[language].setup}</Text>}
    {failed&&<Text accessibilityRole="alert" style={{color:'#A52B36'}}>{proformaAvailability[language].denied}</Text>}
  </View>;
}
