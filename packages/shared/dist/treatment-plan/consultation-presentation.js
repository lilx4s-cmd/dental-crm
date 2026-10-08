"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsultationPaymentTermsSchema = void 0;
exports.consultationPresentationCopy = consultationPresentationCopy;
exports.consultationBrandPalette = consultationBrandPalette;
exports.consultationQuotedPayment = consultationQuotedPayment;
exports.consultationVisitPurpose = consultationVisitPurpose;
exports.consultationTreatmentSummary = consultationTreatmentSummary;
exports.consultationVisitBreakdown = consultationVisitBreakdown;
exports.preserveConsultationLineDetails = preserveConsultationLineDetails;
const zod_1 = require("zod");
const package_and_payment_1 = require("./package-and-payment");
const consultation_1 = require("./consultation");
const consultation_copy_1 = require("./consultation-copy");
/** Patient-facing wording shared by the browser and printed proposal. */
const en = {
    estimate: 'Treatment estimate',
    toQuote: 'Price to be confirmed',
    amount: 'Amount',
    visitFee: 'Visit fee',
    recorded: 'Recorded findings',
    proposed: 'Proposed treatment',
    positionsPending: 'Positions to be confirmed',
    natural: 'Natural tooth',
    naturalCrown: 'Crown on natural tooth',
    implantCrown: 'Implant-supported crown',
    plannedExtraction: 'Planned extraction',
    days: 'Estimated treatment days',
    durationPending: 'Duration to be confirmed',
    nextSteps: 'Your next step',
    nextStepText: 'Contact the International Patient Department to review this estimate, confirm the treatment and visit dates with the dentist, and agree payment arrangements before booking travel.',
    healingText: 'During healing, follow the treating dentist’s aftercare instructions. Recovery is reviewed before the next visit is confirmed.',
    separateVisits: 'Each visit has its own treatment and fee. The dentist will confirm whether healing is complete and when the next visit can take place.',
    surgicalPurpose: 'Assessment and the proposed surgical treatment',
    restorativePurpose: 'Preparation and fitting of the proposed restorations',
    generalPurpose: 'Assessment and the proposed dental treatment',
    cashTotal: 'Cash total',
    cardTotal: 'Card total',
    cardExtra: 'Card fee amount',
    depositRequested: 'Deposit requested',
    remainingCash: 'Remaining after requested deposit (cash)',
    remainingCard: 'Remaining after requested deposit (card)',
    quoteOnly: 'These are quoted payment amounts, not a receipt or confirmation of a payment received.',
    patientPreview: 'Patient preview',
    pdfPreview: 'PDF preview',
    openPdf: 'Open PDF',
    saveGenerate: 'Save and generate PDF',
    refreshTreatment: 'Apply treatment text',
    prepared: 'Prepared',
    reference: 'Reference',
    clinicalNote: 'Clinical note',
    discountReason: 'Reason for price exception or discount',
    reparseAdvice: "Saved details were kept. Edit the existing treatment rows individually."
};
const copy = {
    en,
    ar: {
        estimate: 'تقدير تكلفة العلاج',
        toQuote: 'السعر قيد التأكيد',
        amount: 'المبلغ',
        visitFee: 'تكلفة الزيارة',
        recorded: 'الحالة المسجلة',
        proposed: 'العلاج المقترح',
        positionsPending: 'مواضع الأسنان قيد التأكيد',
        natural: 'سن طبيعي',
        naturalCrown: 'تاج على سن طبيعي',
        implantCrown: 'تاج مدعوم بزرعة',
        plannedExtraction: 'خلع مخطط',
        days: 'أيام العلاج المقدرة',
        durationPending: 'مدة العلاج قيد التأكيد',
        nextSteps: 'خطوتك التالية',
        nextStepText: 'تواصل مع قسم المرضى الدوليين لمراجعة هذا التقدير وتأكيد العلاج ومواعيد الزيارات مع طبيب الأسنان والاتفاق على الدفع قبل حجز السفر.',
        healingText: 'خلال فترة الالتئام، اتبع تعليمات الرعاية التي يقدمها طبيب الأسنان المعالج. يُراجع التعافي قبل تأكيد الزيارة التالية.',
        separateVisits: 'لكل زيارة علاج وتكلفة مستقلان. يؤكد طبيب الأسنان اكتمال الالتئام وموعد الزيارة التالية.',
        surgicalPurpose: 'التقييم والعلاج الجراحي المقترح',
        restorativePurpose: 'تحضير وتركيب التعويضات المقترحة',
        generalPurpose: 'التقييم وعلاج الأسنان المقترح',
        cashTotal: 'الإجمالي نقداً',
        cardTotal: 'الإجمالي بالبطاقة',
        cardExtra: 'مبلغ رسوم البطاقة',
        depositRequested: 'العربون المطلوب',
        remainingCash: 'المتبقي بعد العربون المطلوب (نقداً)',
        remainingCard: 'المتبقي بعد العربون المطلوب (بالبطاقة)',
        quoteOnly: 'هذه مبالغ دفع مقدرة وليست إيصالاً أو تأكيداً لاستلام دفعة.',
        patientPreview: 'معاينة المريض',
        pdfPreview: 'معاينة PDF',
        openPdf: 'فتح PDF',
        saveGenerate: 'حفظ وإنشاء PDF',
        refreshTreatment: 'تطبيق نص العلاج',
        prepared: 'تاريخ الإعداد',
        reference: 'المرجع',
        clinicalNote: 'ملاحظة سريرية',
        discountReason: 'سبب استثناء السعر أو الخصم',
        reparseAdvice: "تم الاحتفاظ بالتفاصيل المحفوظة. عدّل صفوف العلاج الحالية كل صف على حدة."
    },
    fr: {
        estimate: 'Devis de traitement',
        toQuote: 'Prix à confirmer',
        amount: 'Montant',
        visitFee: 'Prix du séjour',
        recorded: 'État enregistré',
        proposed: 'Traitement proposé',
        positionsPending: 'Positions à confirmer',
        natural: 'Dent naturelle',
        naturalCrown: 'Couronne sur dent naturelle',
        implantCrown: 'Couronne sur implant',
        plannedExtraction: 'Extraction prévue',
        days: 'Jours de traitement estimés',
        durationPending: 'Durée à confirmer',
        nextSteps: 'Votre prochaine étape',
        nextStepText: 'Contactez le service des patients internationaux pour examiner ce devis, confirmer le traitement et les dates avec le dentiste et convenir du paiement avant de réserver le voyage.',
        healingText: 'Pendant la cicatrisation, suivez les consignes de votre dentiste. La récupération sera évaluée avant de confirmer le séjour suivant.',
        separateVisits: 'Chaque séjour a son propre traitement et tarif. Le dentiste confirmera la cicatrisation et la date du séjour suivant.',
        surgicalPurpose: 'Évaluation et traitement chirurgical proposé',
        restorativePurpose: 'Préparation et pose des restaurations proposées',
        generalPurpose: 'Évaluation et soins dentaires proposés',
        cashTotal: 'Total en espèces',
        cardTotal: 'Total par carte',
        cardExtra: 'Montant des frais de carte',
        depositRequested: 'Acompte demandé',
        remainingCash: 'Solde après acompte demandé (espèces)',
        remainingCard: 'Solde après acompte demandé (carte)',
        quoteOnly: 'Ces montants sont un devis de paiement, pas un reçu ni une confirmation de paiement.',
        patientPreview: 'Aperçu patient',
        pdfPreview: 'Aperçu PDF',
        openPdf: 'Ouvrir le PDF',
        saveGenerate: 'Enregistrer et créer le PDF',
        refreshTreatment: 'Appliquer le texte du traitement',
        prepared: 'Préparé le',
        reference: 'Référence',
        clinicalNote: 'Note clinique',
        discountReason: 'Motif du prix exceptionnel ou de la remise',
        reparseAdvice: "Les détails enregistrés sont conservés. Modifiez chaque ligne de traitement séparément."
    },
    tr: {
        estimate: 'Tedavi fiyat teklifi',
        toQuote: 'Fiyat teyit edilecek',
        amount: 'Tutar',
        visitFee: 'Ziyaret ücreti',
        recorded: 'Kaydedilen bulgular',
        proposed: 'Önerilen tedavi',
        positionsPending: 'Diş konumları teyit edilecek',
        natural: 'Doğal diş',
        naturalCrown: 'Doğal diş üzerine kron',
        implantCrown: 'İmplant destekli kron',
        plannedExtraction: 'Planlanan çekim',
        days: 'Tahmini tedavi günü',
        durationPending: 'Süre teyit edilecek',
        nextSteps: 'Sonraki adımınız',
        nextStepText: 'Seyahati rezerve etmeden önce bu teklifi değerlendirmek, tedavi ve ziyaret tarihlerini diş hekimiyle teyit etmek ve ödemeyi kararlaştırmak için Uluslararası Hasta Birimi ile iletişime geçin.',
        healingText: 'İyileşme sırasında diş hekiminizin bakım talimatlarını izleyin. Sonraki ziyaret teyit edilmeden önce iyileşme değerlendirilir.',
        separateVisits: 'Her ziyaretin tedavisi ve ücreti ayrıdır. Diş hekimi iyileşmeyi ve sonraki ziyaret zamanını teyit edecektir.',
        surgicalPurpose: 'Değerlendirme ve önerilen cerrahi tedavi',
        restorativePurpose: 'Önerilen restorasyonların hazırlanması ve takılması',
        generalPurpose: 'Değerlendirme ve önerilen diş tedavisi',
        cashTotal: 'Nakit toplam',
        cardTotal: 'Kartla toplam',
        cardExtra: 'Kart ücreti tutarı',
        depositRequested: 'İstenen kapora',
        remainingCash: 'İstenen kaporadan sonra kalan (nakit)',
        remainingCard: 'İstenen kaporadan sonra kalan (kart)',
        quoteOnly: 'Bunlar teklif edilen ödeme tutarlarıdır; makbuz veya alınmış bir ödemenin teyidi değildir.',
        patientPreview: 'Hasta önizlemesi',
        pdfPreview: 'PDF önizlemesi',
        openPdf: 'PDF aç',
        saveGenerate: 'Kaydet ve PDF oluştur',
        refreshTreatment: 'Tedavi metnini uygula',
        prepared: 'Hazırlanma tarihi',
        reference: 'Referans',
        clinicalNote: 'Klinik not',
        discountReason: 'Fiyat istisnası veya indirim nedeni',
        reparseAdvice: "Kayıtlı bilgiler korundu. Mevcut tedavi satırlarını ayrı ayrı düzenleyin."
    },
    de: {
        estimate: 'Kostenvoranschlag',
        toQuote: 'Preis noch zu bestätigen',
        amount: 'Betrag',
        visitFee: 'Kosten des Besuchs',
        recorded: 'Erfasster Befund',
        proposed: 'Geplante Behandlung',
        positionsPending: 'Positionen noch zu bestätigen',
        natural: 'Natürlicher Zahn',
        naturalCrown: 'Krone auf natürlichem Zahn',
        implantCrown: 'Implantatgetragene Krone',
        plannedExtraction: 'Geplante Extraktion',
        days: 'Geschätzte Behandlungstage',
        durationPending: 'Dauer noch zu bestätigen',
        nextSteps: 'Ihr nächster Schritt',
        nextStepText: 'Kontaktieren Sie die internationale Patientenabteilung, um diesen Kostenvoranschlag zu besprechen, Behandlung und Termine mit dem Zahnarzt zu bestätigen und die Zahlung vor der Reisebuchung zu vereinbaren.',
        healingText: 'Befolgen Sie während der Heilung die Nachsorgehinweise Ihres Zahnarztes. Die Genesung wird vor dem nächsten Termin überprüft.',
        separateVisits: 'Jeder Besuch umfasst eine eigene Behandlung und eigene Kosten. Der Zahnarzt bestätigt die Heilung und den nächsten Termin.',
        surgicalPurpose: 'Untersuchung und geplante chirurgische Behandlung',
        restorativePurpose: 'Vorbereitung und Eingliederung des geplanten Zahnersatzes',
        generalPurpose: 'Untersuchung und geplante Zahnbehandlung',
        cashTotal: 'Gesamtbetrag bar',
        cardTotal: 'Gesamtbetrag mit Karte',
        cardExtra: 'Betrag der Kartengebühr',
        depositRequested: 'Angeforderte Anzahlung',
        remainingCash: 'Rest nach angeforderter Anzahlung (bar)',
        remainingCard: 'Rest nach angeforderter Anzahlung (Karte)',
        quoteOnly: 'Dies sind angebotene Zahlungsbeträge, keine Quittung oder Bestätigung einer erhaltenen Zahlung.',
        patientPreview: 'Patientenvorschau',
        pdfPreview: 'PDF-Vorschau',
        openPdf: 'PDF öffnen',
        saveGenerate: 'Speichern und PDF erstellen',
        refreshTreatment: 'Behandlungstext übernehmen',
        prepared: 'Erstellt am',
        reference: 'Referenz',
        clinicalNote: 'Klinischer Hinweis',
        discountReason: 'Grund für Preisabweichung oder Rabatt',
        reparseAdvice: "Gespeicherte Angaben bleiben erhalten. Bearbeiten Sie die bestehenden Behandlungszeilen einzeln."
    },
    es: {
        estimate: 'Presupuesto de tratamiento',
        toQuote: 'Precio por confirmar',
        amount: 'Importe',
        visitFee: 'Coste de la visita',
        recorded: 'Hallazgos registrados',
        proposed: 'Tratamiento propuesto',
        positionsPending: 'Posiciones por confirmar',
        natural: 'Diente natural',
        naturalCrown: 'Corona sobre diente natural',
        implantCrown: 'Corona sobre implante',
        plannedExtraction: 'Extracción prevista',
        days: 'Días de tratamiento estimados',
        durationPending: 'Duración por confirmar',
        nextSteps: 'Su próximo paso',
        nextStepText: 'Contacte con el Departamento de Pacientes Internacionales para revisar este presupuesto, confirmar el tratamiento y las fechas con el dentista y acordar los pagos antes de reservar el viaje.',
        healingText: 'Durante la cicatrización, siga las instrucciones de su dentista. Se revisará la recuperación antes de confirmar la siguiente visita.',
        separateVisits: 'Cada visita tiene su propio tratamiento y coste. El dentista confirmará la cicatrización y la fecha de la siguiente visita.',
        surgicalPurpose: 'Evaluación y tratamiento quirúrgico propuesto',
        restorativePurpose: 'Preparación y colocación de las restauraciones propuestas',
        generalPurpose: 'Evaluación y tratamiento dental propuesto',
        cashTotal: 'Total en efectivo',
        cardTotal: 'Total con tarjeta',
        cardExtra: 'Importe de la comisión de tarjeta',
        depositRequested: 'Anticipo solicitado',
        remainingCash: 'Saldo tras el anticipo solicitado (efectivo)',
        remainingCard: 'Saldo tras el anticipo solicitado (tarjeta)',
        quoteOnly: 'Estos importes son una propuesta de pago, no un recibo ni una confirmación de un pago recibido.',
        patientPreview: 'Vista del paciente',
        pdfPreview: 'Vista PDF',
        openPdf: 'Abrir PDF',
        saveGenerate: 'Guardar y generar PDF',
        refreshTreatment: 'Aplicar texto del tratamiento',
        prepared: 'Preparado el',
        reference: 'Referencia',
        clinicalNote: 'Nota clínica',
        discountReason: 'Motivo del precio excepcional o descuento',
        reparseAdvice: "Se conservaron los datos guardados. Edite las filas de tratamiento por separado."
    },
    it: {
        estimate: 'Preventivo di trattamento',
        toQuote: 'Prezzo da confermare',
        amount: 'Importo',
        visitFee: 'Costo della visita',
        recorded: 'Condizioni registrate',
        proposed: 'Trattamento proposto',
        positionsPending: 'Posizioni da confermare',
        natural: 'Dente naturale',
        naturalCrown: 'Corona su dente naturale',
        implantCrown: 'Corona su impianto',
        plannedExtraction: 'Estrazione prevista',
        days: 'Giorni di trattamento stimati',
        durationPending: 'Durata da confermare',
        nextSteps: 'Il prossimo passo',
        nextStepText: 'Contatti il reparto pazienti internazionali per esaminare il preventivo, confermare trattamento e date con il dentista e concordare i pagamenti prima di prenotare il viaggio.',
        healingText: 'Durante la guarigione, segua le istruzioni del dentista. Il recupero sarà valutato prima di confermare la visita successiva.',
        separateVisits: 'Ogni visita prevede trattamenti e costi propri. Il dentista confermerà la guarigione e la data della visita successiva.',
        surgicalPurpose: 'Valutazione e trattamento chirurgico proposto',
        restorativePurpose: 'Preparazione e applicazione dei restauri proposti',
        generalPurpose: 'Valutazione e trattamento dentale proposto',
        cashTotal: 'Totale in contanti',
        cardTotal: 'Totale con carta',
        cardExtra: 'Importo della commissione carta',
        depositRequested: 'Acconto richiesto',
        remainingCash: 'Saldo dopo l’acconto richiesto (contanti)',
        remainingCard: 'Saldo dopo l’acconto richiesto (carta)',
        quoteOnly: 'Questi sono importi di pagamento proposti, non una ricevuta né la conferma di un pagamento ricevuto.',
        patientPreview: 'Anteprima paziente',
        pdfPreview: 'Anteprima PDF',
        openPdf: 'Apri PDF',
        saveGenerate: 'Salva e genera PDF',
        refreshTreatment: 'Applica testo del trattamento',
        prepared: 'Preparato il',
        reference: 'Riferimento',
        clinicalNote: 'Nota clinica',
        discountReason: 'Motivo del prezzo speciale o sconto',
        reparseAdvice: "I dati salvati sono stati mantenuti. Modifica le righe di trattamento singolarmente."
    },
    pl: {
        estimate: 'Kosztorys leczenia',
        toQuote: 'Cena do potwierdzenia',
        amount: 'Kwota',
        visitFee: 'Koszt wizyty',
        recorded: 'Zapisany stan',
        proposed: 'Proponowane leczenie',
        positionsPending: 'Pozycje do potwierdzenia',
        natural: 'Naturalny ząb',
        naturalCrown: 'Korona na naturalnym zębie',
        implantCrown: 'Korona na implancie',
        plannedExtraction: 'Planowana ekstrakcja',
        days: 'Szacowana liczba dni leczenia',
        durationPending: 'Czas do potwierdzenia',
        nextSteps: 'Następny krok',
        nextStepText: 'Skontaktuj się z działem pacjentów międzynarodowych, aby omówić kosztorys, potwierdzić leczenie i terminy z dentystą oraz ustalić płatności przed rezerwacją podróży.',
        healingText: 'Podczas gojenia przestrzegaj zaleceń dentysty. Przed potwierdzeniem kolejnej wizyty zostanie oceniona rekonwalescencja.',
        separateVisits: 'Każda wizyta ma osobne leczenie i koszt. Dentysta potwierdzi wygojenie i termin kolejnej wizyty.',
        surgicalPurpose: 'Ocena i proponowane leczenie chirurgiczne',
        restorativePurpose: 'Przygotowanie i dopasowanie proponowanych uzupełnień',
        generalPurpose: 'Ocena i proponowane leczenie stomatologiczne',
        cashTotal: 'Razem gotówką',
        cardTotal: 'Razem kartą',
        cardExtra: 'Kwota opłaty za kartę',
        depositRequested: 'Wymagana zaliczka',
        remainingCash: 'Saldo po wymaganej zaliczce (gotówka)',
        remainingCard: 'Saldo po wymaganej zaliczce (karta)',
        quoteOnly: 'Są to proponowane kwoty płatności, a nie pokwitowanie ani potwierdzenie otrzymanej wpłaty.',
        patientPreview: 'Podgląd pacjenta',
        pdfPreview: 'Podgląd PDF',
        openPdf: 'Otwórz PDF',
        saveGenerate: 'Zapisz i utwórz PDF',
        refreshTreatment: 'Zastosuj tekst leczenia',
        prepared: 'Przygotowano',
        reference: 'Numer dokumentu',
        clinicalNote: 'Uwaga kliniczna',
        discountReason: 'Powód zmiany ceny lub rabatu',
        reparseAdvice: "Zapisane dane zachowano. Edytuj istniejące pozycje leczenia osobno."
    },
    hr: {
        estimate: 'Procjena troškova liječenja',
        toQuote: 'Cijena se treba potvrditi',
        amount: 'Iznos',
        visitFee: 'Cijena posjeta',
        recorded: 'Zabilježeni nalazi',
        proposed: 'Predloženo liječenje',
        positionsPending: 'Položaji se trebaju potvrditi',
        natural: 'Prirodni zub',
        naturalCrown: 'Krunica na prirodnom zubu',
        implantCrown: 'Krunica na implantatu',
        plannedExtraction: 'Planirano vađenje',
        days: 'Procijenjeni dani liječenja',
        durationPending: 'Trajanje se treba potvrditi',
        nextSteps: 'Vaš sljedeći korak',
        nextStepText: 'Kontaktirajte Odjel za međunarodne pacijente kako biste pregledali procjenu, potvrdili liječenje i datume sa stomatologom te dogovorili plaćanje prije rezervacije putovanja.',
        healingText: 'Tijekom cijeljenja slijedite upute svog stomatologa. Oporavak se procjenjuje prije potvrde sljedećeg posjeta.',
        separateVisits: 'Svaki posjet ima zasebno liječenje i cijenu. Stomatolog će potvrditi cijeljenje i vrijeme sljedećeg posjeta.',
        surgicalPurpose: 'Procjena i predloženo kirurško liječenje',
        restorativePurpose: 'Priprema i postavljanje predloženih nadomjestaka',
        generalPurpose: 'Procjena i predloženo stomatološko liječenje',
        cashTotal: 'Ukupno gotovinom',
        cardTotal: 'Ukupno karticom',
        cardExtra: 'Iznos naknade za karticu',
        depositRequested: 'Zatraženi predujam',
        remainingCash: 'Preostalo nakon zatraženog predujma (gotovina)',
        remainingCard: 'Preostalo nakon zatraženog predujma (kartica)',
        quoteOnly: 'Ovo su ponuđeni iznosi plaćanja, a ne račun ni potvrda primljene uplate.',
        patientPreview: 'Pregled za pacijenta',
        pdfPreview: 'Pregled PDF-a',
        openPdf: 'Otvori PDF',
        saveGenerate: 'Spremi i izradi PDF',
        refreshTreatment: 'Primijeni tekst liječenja',
        prepared: 'Pripremljeno',
        reference: 'Referenca',
        clinicalNote: 'Klinička napomena',
        discountReason: 'Razlog posebne cijene ili popusta',
        reparseAdvice: "Spremljeni podaci su sačuvani. Uredite postojeće stavke liječenja pojedinačno."
    },
    ru: {
        estimate: 'Предварительная стоимость лечения',
        toQuote: 'Цена уточняется',
        amount: 'Сумма',
        visitFee: 'Стоимость визита',
        recorded: 'Зафиксированное состояние',
        proposed: 'Предлагаемое лечение',
        positionsPending: 'Позиции уточняются',
        natural: 'Естественный зуб',
        naturalCrown: 'Коронка на естественном зубе',
        implantCrown: 'Коронка на импланте',
        plannedExtraction: 'Планируемое удаление',
        days: 'Ориентировочные дни лечения',
        durationPending: 'Срок уточняется',
        nextSteps: 'Ваш следующий шаг',
        nextStepText: 'Свяжитесь с отделом международных пациентов, чтобы обсудить смету, подтвердить лечение и даты с врачом и согласовать оплату до бронирования поездки.',
        healingText: 'Во время заживления соблюдайте рекомендации лечащего стоматолога. Восстановление оценивается до подтверждения следующего визита.',
        separateVisits: 'У каждого визита отдельное лечение и стоимость. Врач подтвердит завершение заживления и дату следующего визита.',
        surgicalPurpose: 'Оценка и предлагаемое хирургическое лечение',
        restorativePurpose: 'Подготовка и установка предлагаемых реставраций',
        generalPurpose: 'Оценка и предлагаемое стоматологическое лечение',
        cashTotal: 'Итого наличными',
        cardTotal: 'Итого картой',
        cardExtra: 'Сумма комиссии за карту',
        depositRequested: 'Запрашиваемый депозит',
        remainingCash: 'Остаток после запрашиваемого депозита (наличные)',
        remainingCard: 'Остаток после запрашиваемого депозита (карта)',
        quoteOnly: 'Это предлагаемые суммы платежей, а не квитанция или подтверждение полученной оплаты.',
        patientPreview: 'Предпросмотр для пациента',
        pdfPreview: 'Предпросмотр PDF',
        openPdf: 'Открыть PDF',
        saveGenerate: 'Сохранить и создать PDF',
        refreshTreatment: 'Применить текст лечения',
        prepared: 'Подготовлено',
        reference: 'Номер документа',
        clinicalNote: 'Клиническая заметка',
        discountReason: 'Причина изменения цены или скидки',
        reparseAdvice: "Сохранённые данные оставлены без изменений. Изменяйте строки лечения по отдельности."
    }
};
function consultationPresentationCopy(language) {
    return copy[language];
}
/** Keep clinic colours readable even when a light accent is configured. */
function consultationBrandPalette(colour = '#183858') {
    const accent = /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#183858';
    const channels = [1, 3, 5].map(index => {
        const value = parseInt(accent.slice(index, index + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return {
        accent,
        onAccent: 1.05 / (luminance + 0.05) >= 4.5 ? '#ffffff' : '#000000',
        heading: luminance > 0.18 ? '#183858' : accent
    };
}
exports.ConsultationPaymentTermsSchema = zod_1.z.object({
    terms: zod_1.z.string().max(2500).nullable().optional(),
    cardFee: zod_1.z.number().min(0).max(100).nullable().optional(),
    cashDiscount: zod_1.z.number().min(0).max(100).nullable().optional(),
    depositPercent: zod_1.z.number().min(0).max(100).nullable().optional(),
    depositAmount: zod_1.z.number().min(0).max(10000000).nullable().optional()
});
function consultationQuotedPayment(plan, payment = {}) {
    const total = (0, consultation_1.consultationTotals)(plan).total;
    return (0, package_and_payment_1.computePaymentSummary)({
        total,
        cardFeePercent: payment.cardFee,
        cashDiscountPercent: payment.cashDiscount,
        depositAmount: payment.depositAmount ?? (payment.depositPercent == null ? null : Math.round(total * payment.depositPercent) / 100)
    });
}
function consultationVisitPurpose(plan, visit) {
    const types = plan.lines.filter(line => line.visit === visit).map(line => line.type);
    const t = consultationPresentationCopy(plan.language);
    if (types.some(type => ['implant', 'extraction', 'sinus', 'graft'].includes(type)))
        return t.surgicalPurpose;
    if (types.some(type => ['crown', 'implantCrown', 'veneer', 'bridge'].includes(type)))
        return t.restorativePurpose;
    return t.generalPurpose;
}
/** The patient headline follows saved procedure quantities, including manual editor changes. */
function consultationTreatmentSummary(plan) {
    const t = (0, consultation_copy_1.consultationCopy)(plan.language);
    const quantities = new Map();
    for (const line of plan.lines)
        quantities.set(line.type, (quantities.get(line.type) ?? 0) + line.quantity);
    return [...quantities].map(([type, quantity]) => `${quantity} × ${t[type]}`).join(' + ');
}
function consultationVisitBreakdown(plan, visit) {
    const lines = plan.lines.filter(line => line.visit === visit);
    const discount = Math.round(lines.reduce((sum, line) => sum + line.discount, 0) * 100) / 100;
    const price = (0, consultation_1.consultationTotals)(plan).visits.find(price => price.number === visit);
    return {
        ...price,
        discount,
        subtotal: Math.round((price.treatments + discount) * 100) / 100
    };
}
/** Applying edited text must not silently replace approved prices, positions or exceptions. */
function preserveConsultationLineDetails(parsed, saved, treatmentText = '') {
    const used = new Set();
    const reserved = new Set([...saved, ...parsed].map(line => line.id));
    const normalise = (value) => value.toLowerCase().replace(/[.\s-]/g, '');
    const input = normalise(treatmentText);
    const explicitDetails = (line) => !!line.brand && input.includes(normalise(line.brand)) ||
        !!line.material && (input.includes(normalise(line.material)) ||
            line.material === 'Zirconia' && /zircon|zirkon|زركون/i.test(treatmentText) ||
            line.material === 'E.max' && /e[. -]?max/i.test(treatmentText));
    const key = (line) => [line.type, line.jaw ?? '', normalise(line.material ?? ''), normalise(line.brand ?? '')].join('|');
    return parsed.flatMap(line => {
        const generic = !explicitDetails(line);
        const candidates = saved.filter(candidate => !used.has(candidate.id) && candidate.type === line.type && (!line.jaw || candidate.jaw === line.jaw));
        if (generic && candidates.length > 1) {
            // A plain-text summary may aggregate rows with different prices or brands.
            // Keep an unchanged group intact; changing its allocation requires row editing.
            const parsedCount = parsed.filter(candidate => candidate.type === line.type && (!line.jaw || candidate.jaw === line.jaw)).length;
            if (parsedCount === 1 && !line.positions.length && candidates.reduce((quantity, candidate) => quantity + candidate.quantity, 0) === line.quantity) {
                candidates.forEach(candidate => used.add(candidate.id));
                return candidates.map(candidate => ({ ...candidate, positions: [...candidate.positions] }));
            }
            throw new Error('Ambiguous saved treatment allocation');
        }
        const previous = generic ? candidates[0] : saved.find(candidate => !used.has(candidate.id) && key(candidate) === key(line));
        if (!previous) {
            let id = line.id, suffix = 0;
            if (saved.some(candidate => candidate.id === id)) {
                do {
                    id = `${line.id}-new-${++suffix}`;
                } while (reserved.has(id));
                reserved.add(id);
            }
            return [{ ...line, id }];
        }
        used.add(previous.id);
        return [{
                ...line,
                id: previous.id,
                material: previous.material,
                brand: previous.brand,
                jaw: line.jaw ?? previous.jaw,
                unitPrice: previous.unitPrice,
                discount: previous.discount,
                overrideReason: previous.overrideReason,
                description: previous.description,
                visit: previous.visit,
                positions: line.positions.length ? line.positions : previous.positions,
            }];
    });
}
//# sourceMappingURL=consultation-presentation.js.map