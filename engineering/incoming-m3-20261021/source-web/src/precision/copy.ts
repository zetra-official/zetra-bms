import type {Language} from '../i18n/catalog';
export const precisionCopy:Record<Language,{packSize:string;invalid:string;UNIT:string;BOX:string;PACK:string}>={
 en:{packSize:'Pack size',invalid:'Enter valid pack size and pack prices, with at most six decimal places. Unsupported precision is rejected.',UNIT:'Unit',BOX:'Box',PACK:'Pack'},
 sw:{packSize:'Ukubwa wa pakiti',invalid:'Weka ukubwa na bei halali za pakiti, zenye desimali zisizozidi sita. Precision isiyoungwa mkono inakataliwa.',UNIT:'Kipimo',BOX:'Boksi',PACK:'Pakiti'},
 fr:{packSize:'Taille du paquet',invalid:'Saisissez une taille et des prix valides, avec six décimales au maximum. Toute précision non prise en charge est refusée.',UNIT:'Unité',BOX:'Boîte',PACK:'Paquet'},
 pt:{packSize:'Tamanho da embalagem',invalid:'Introduza tamanho e preços válidos, com até seis casas decimais. Precisão não suportada é rejeitada.',UNIT:'Unidade',BOX:'Caixa',PACK:'Embalagem'},
 ar:{packSize:'حجم العبوة',invalid:'أدخل حجم العبوة وأسعارها بقيم صحيحة وبحد أقصى ست منازل عشرية. تُرفض الدقة غير المدعومة.',UNIT:'وحدة',BOX:'صندوق',PACK:'عبوة'},
 es:{packSize:'Tamaño del paquete',invalid:'Introduzca tamaño y precios válidos con un máximo de seis decimales. Se rechaza la precisión no admitida.',UNIT:'Unidad',BOX:'Caja',PACK:'Paquete'},
 zh:{packSize:'包装规格',invalid:'请输入有效的包装规格和价格，最多六位小数。不支持的精度将被拒绝。',UNIT:'单件',BOX:'整箱',PACK:'整包'}
};
