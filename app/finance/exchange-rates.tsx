import React from 'react';
import {useRouter} from 'expo-router';
import {Screen} from '@/src/ui/Screen';
import {Button} from '@/src/ui/Button';
import {FinanceConverter} from '@/src/currency/FinanceConverter';
import {useMasterText} from '@/src/currency/masterMessages';
export default function ExchangeRates(){const router=useRouter(),t=useMasterText();return <Screen scroll><Button title={t('back')} onPress={()=>router.back()} variant="secondary"/><FinanceConverter/></Screen>;}
