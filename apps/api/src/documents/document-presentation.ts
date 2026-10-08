import { Prisma } from '@prisma/client';
import type { Consultation } from '@dental-crm/shared';
const keys = ['issued', 'due', 'generated', 'billTo', 'billFrom', 'taxId', 'amount', 'paymentHistory', 'date', 'method', 'reference', 'terms', 'quote', 'credit', 'currencyReview', 'notIssued', 'notSet', 'toQuote', 'draft', 'sent', 'partial', 'paid', 'cancelled', 'overdue', 'refunded'] as const;
const labels: Record<Consultation['language'], string[]> = {
  en: ['Issue date','Due date','Generated','Bill to','Bill from','Tax / registration ID','Amount','Payments received','Date','Method','Reference','Payment instructions','Treatment estimate - not an invoice','Credit balance','Payments in another currency need reconciliation and are excluded from this balance.','Not issued','Not specified','To be quoted','Draft','Issued','Partially paid','Paid','Cancelled','Overdue','Refunded'],
  ar: ['تاريخ الإصدار','تاريخ الاستحقاق','تاريخ الإنشاء','العميل','جهة إصدار الفاتورة','الرقم الضريبي / التسجيل','المبلغ','الدفعات المستلمة','التاريخ','الطريقة','المرجع','تعليمات الدفع','تقدير تكلفة العلاج - ليس فاتورة','رصيد دائن','الدفعات بعملة أخرى تحتاج إلى تسوية ولم تخصم من هذا الرصيد.','لم تصدر','غير محدد','السعر سيحدد لاحقاً','مسودة','صادرة','مدفوعة جزئياً','مدفوعة','ملغاة','متأخرة','مستردة'],
  fr: ["Date d’émission","Échéance","Généré le","Facturé à","Émetteur","Identifiant fiscal / registre","Montant","Paiements reçus","Date","Mode","Référence","Instructions de paiement","Devis de traitement - pas une facture","Solde créditeur","Les paiements dans une autre devise nécessitent un rapprochement et sont exclus de ce solde.","Non émise","Non précisé","À chiffrer","Brouillon","Émise","Partiellement payée","Payée","Annulée","En retard","Remboursée"],
  de: ['Ausstellungsdatum','Fällig am','Erstellt am','Rechnung an','Rechnungssteller','Steuer- / Registrierungsnummer','Betrag','Erhaltene Zahlungen','Datum','Methode','Referenz','Zahlungsanweisungen','Behandlungsvoranschlag - keine Rechnung','Guthaben','Zahlungen in anderer Währung müssen abgeglichen werden und sind hier nicht abgezogen.','Nicht ausgestellt','Nicht angegeben','Preis offen','Entwurf','Ausgestellt','Teilweise bezahlt','Bezahlt','Storniert','Überfällig','Erstattet'],
  es: ['Fecha de emisión','Vencimiento','Generado','Facturar a','Emisor','Identificación fiscal / registro','Importe','Pagos recibidos','Fecha','Método','Referencia','Instrucciones de pago','Presupuesto de tratamiento - no es una factura','Saldo a favor','Los pagos en otra moneda requieren conciliación y no se descuentan de este saldo.','Sin emitir','Sin especificar','Por cotizar','Borrador','Emitida','Pagada parcialmente','Pagada','Cancelada','Vencida','Reembolsada'],
  it: ['Data di emissione','Scadenza','Generato','Intestato a','Emittente','Codice fiscale / registrazione','Importo','Pagamenti ricevuti','Data','Metodo','Riferimento','Istruzioni di pagamento','Preventivo di trattamento - non è una fattura','Saldo a credito','I pagamenti in altra valuta richiedono riconciliazione e sono esclusi da questo saldo.','Non emessa','Non specificato','Da quotare','Bozza','Emessa','Parzialmente pagata','Pagata','Annullata','Scaduta','Rimborsata'],
  tr: ['Düzenleme tarihi','Son ödeme tarihi','Oluşturulma','Fatura alıcısı','Fatura düzenleyen','Vergi / sicil numarası','Tutar','Alınan ödemeler','Tarih','Yöntem','Referans','Ödeme talimatları','Tedavi fiyat teklifi - fatura değildir','Alacak bakiyesi','Başka para birimindeki ödemeler mutabakat gerektirir ve bu bakiyeden düşülmemiştir.','Düzenlenmedi','Belirtilmedi','Fiyat belirlenecek','Taslak','Düzenlendi','Kısmen ödendi','Ödendi','İptal','Gecikmiş','İade edildi'],
  pl: ['Data wystawienia','Termin płatności','Wygenerowano','Nabywca','Wystawca','Identyfikator podatkowy / rejestr','Kwota','Otrzymane płatności','Data','Metoda','Numer referencyjny','Instrukcje płatności','Wycena leczenia - nie jest fakturą','Nadpłata','Płatności w innej walucie wymagają uzgodnienia i nie zostały odjęte od salda.','Nie wystawiono','Nie określono','Do wyceny','Projekt','Wystawiona','Częściowo opłacona','Opłacona','Anulowana','Po terminie','Zwrócona'],
  hr: ['Datum izdavanja','Dospijeće','Izrađeno','Primatelj računa','Izdavatelj','Porezni / registracijski broj','Iznos','Primljene uplate','Datum','Način','Referenca','Upute za plaćanje','Ponuda za liječenje - nije račun','Preplaćeni iznos','Uplate u drugoj valuti treba uskladiti i nisu odbijene od ovog salda.','Nije izdano','Nije navedeno','Cijena naknadno','Nacrt','Izdano','Djelomično plaćeno','Plaćeno','Otkazano','Dospjelo','Vraćeno'],
  ru: ['Дата выставления','Срок оплаты','Создано','Получатель','Выставлено','Налоговый / регистрационный номер','Сумма','Полученные платежи','Дата','Способ','Номер платежа','Инструкции по оплате','Смета лечения - не является счётом','Переплата','Платежи в другой валюте требуют сверки и не вычтены из этого остатка.','Не выставлен','Не указано','Цена уточняется','Черновик','Выставлен','Частично оплачен','Оплачен','Отменён','Просрочен','Возвращён'],
};
export function documentLabels(language: Consultation['language']) {
  return Object.fromEntries(keys.map((key, i) => [key, labels[language][i]])) as Record<typeof keys[number], string>;
}
export function invoiceStatusLabel(status: string, language: Consultation['language']) {
  const copy = documentLabels(language);
  const map: Record<string, keyof typeof copy> = { DRAFT: 'draft', SENT: 'sent', PARTIALLY_PAID: 'partial', PAID: 'paid', CANCELLED: 'cancelled', OVERDUE: 'overdue', REFUNDED: 'refunded' };
  return map[status] ? copy[map[status]] : status;
}
export function documentDate(value?: string | Date | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}
export function invoiceDisplayTotals<P extends { amount: number | string; status: string; currency?: string }>(invoice: { total: number | string; payments: P[] }, currency: string) {
  const completed = invoice.payments.filter(p => p.status === 'COMPLETED');
  const payments = completed.filter(p => !p.currency || p.currency === currency);
  const paid = payments.reduce((sum, p) => sum.add(String(p.amount)), new Prisma.Decimal(0));
  const remainder = new Prisma.Decimal(String(invoice.total)).minus(paid);
  return { paid: paid.toNumber(), balance: Prisma.Decimal.max(0, remainder).toNumber(), credit: Prisma.Decimal.max(0, remainder.negated()).toNumber(), currencyReview: payments.length !== completed.length, payments };
}
