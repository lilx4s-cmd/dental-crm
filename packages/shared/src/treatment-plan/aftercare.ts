import { ToothCondition } from '../dental/tooth-conditions';

// Patient guidance printed into the treatment dossier. Written once here rather than retyped per
// patient so every dossier says the same thing, and so correcting a clinical instruction corrects
// it everywhere at once instead of only on documents issued after the fix.
//
// Scope: general recovery guidance of the kind a clinic hands out on paper. It is deliberately
// non-prescriptive about drugs and doses — those depend on the individual and belong to the
// treating dentist, so the text defers to them rather than inventing numbers.

export interface AftercareSection {
  /** The procedure this covers. */
  condition: ToothCondition;
  title: string;
  /** What the appointment itself involves, so the patient is not surprised on the day. */
  whatToExpect: string;
  /** Ordered so the most time-critical instruction is first. */
  aftercare: string[];
  /** Symptoms that mean "contact the clinic", not "wait and see". */
  warningSigns?: string[];
}

export const AFTERCARE_SECTIONS: AftercareSection[] = [
  {
    condition: 'IMPLANT',
    title: 'Dental implants',
    whatToExpect:
      'The implant is placed into the jawbone under local anaesthetic, usually with sedation available if you would prefer it. You should feel pressure but not pain. Most patients need a few days of quiet recovery, after which the implant is left to fuse with the bone before the final crown is fitted.',
    aftercare: [
      'Bite gently on the gauze for the first hour and change it only if it soaks through.',
      'Use a cold compress on the cheek in 20-minute intervals for the first day to limit swelling.',
      'Eat soft, cool food for 48 hours and chew on the opposite side.',
      'Do not smoke. Smoking is the single biggest cause of implant failure because it starves the healing bone of blood supply.',
      'Do not rinse forcefully or use a straw for 24 hours — suction can dislodge the clot the site needs to heal.',
      'Keep the rest of your mouth clean as normal, and start gentle salt-water rinses from the second day.',
      'Take any medication exactly as your dentist prescribed it, and finish the full course of antibiotics if you were given one.',
    ],
    warningSigns: [
      'Bleeding that has not settled after several hours of firm pressure',
      'Swelling or pain that is increasing rather than easing after the third day',
      'A fever, or a bad taste and discharge from the site',
      'The implant or healing cap feeling loose',
    ],
  },
  {
    condition: 'CROWN',
    title: 'Crowns and bridges',
    whatToExpect:
      'The tooth is shaped to receive the crown and an impression or digital scan is taken. You will wear a temporary crown while the permanent one is made. Fitting the final crown is quick and usually needs no anaesthetic.',
    aftercare: [
      'Treat a temporary crown carefully: avoid sticky and hard food, and floss by pulling the thread out sideways rather than back up.',
      'Mild sensitivity to hot and cold for a week or two after fitting is normal and settles on its own.',
      'If your bite feels high or uneven once the permanent crown is cemented, tell the clinic — this is adjusted in minutes and should not be lived with.',
      'Clean around the crown margin as thoroughly as a natural tooth. Crowns do not decay, but the tooth underneath still can.',
    ],
    warningSigns: [
      'A temporary crown that comes off — keep it and contact the clinic',
      'Persistent pain when biting after the permanent crown is fitted',
    ],
  },
  {
    condition: 'EXTRACTION',
    title: 'Tooth extraction',
    whatToExpect:
      'The area is fully numbed before the tooth is removed. You will feel firm pressure and movement, which is normal, but should not feel sharp pain. Simple extractions take a few minutes; surgical ones take longer and may need stitches.',
    aftercare: [
      'Bite firmly on the gauze for 30–60 minutes without checking it repeatedly — the clot needs to be left alone to form.',
      'For the first 24 hours do not rinse, spit forcefully, smoke, or drink through a straw. Losing the clot causes a dry socket, which is genuinely painful and needs treating.',
      'Use a cold compress for the first day, then warm salt-water rinses from day two.',
      'Keep to soft, lukewarm food and stay well hydrated.',
      'Sleep with your head slightly raised for the first night to reduce throbbing.',
    ],
    warningSigns: [
      'Severe pain starting two to four days afterwards, often spreading to the ear — this suggests a dry socket',
      'Bleeding that restarts heavily and will not stop with pressure',
      'Fever, or swelling that spreads towards the eye or throat',
    ],
  },
  {
    condition: 'ROOT_CANAL',
    title: 'Root canal treatment',
    whatToExpect:
      'The infected nerve tissue is removed from inside the tooth, the canals are cleaned and shaped, and then sealed. It is done under anaesthetic and is not the ordeal its reputation suggests — most patients report it feels much like having a filling.',
    aftercare: [
      'Avoid chewing on the tooth until the permanent filling or crown is placed; a treated tooth is brittle until it is properly restored.',
      'Tenderness when biting for a few days is normal as the ligament around the root settles.',
      'Take pain relief as advised rather than waiting for discomfort to build.',
      'Come back for the final restoration. A root-treated tooth left with only a temporary seal will eventually fracture or reinfect.',
    ],
    warningSigns: [
      'Swelling of the face or gum',
      'Pain that worsens over several days instead of easing',
      'The temporary filling coming out',
    ],
  },
  {
    condition: 'SINUS_LIFT',
    title: 'Sinus lift',
    whatToExpect:
      'Bone is added beneath the sinus floor in the upper jaw to create enough height for implants. It is done under local anaesthetic, and the graft needs several months to mature before implants can be loaded.',
    aftercare: [
      'Do not blow your nose for at least two weeks — pressure can disturb the graft. Sneeze with your mouth open.',
      'Avoid flying, diving and strenuous exercise for as long as your surgeon advises.',
      'Do not smoke; it markedly reduces the chance of the graft taking.',
      'Sleep with your head elevated and use any prescribed nasal spray or decongestant as directed.',
      'Some spotting of blood from the nose in the first days is expected.',
    ],
    warningSigns: [
      'Heavy or persistent nosebleeds',
      'Fluid or air passing between your mouth and nose',
      'Increasing facial swelling, fever, or a blocked, painful sinus',
    ],
  },
  {
    condition: 'BONE_GRAFT',
    title: 'Bone graft',
    whatToExpect:
      'Grafting material is placed where the jawbone is too thin or too short to hold an implant. It is often done at the same visit as an extraction. The graft is gradually replaced by your own bone over several months.',
    aftercare: [
      'Do not press, poke or lift the lip to inspect the site — the graft needs to be left undisturbed.',
      'Expect a few small granules in the mouth over the first days; this is normal and not the whole graft coming away.',
      'Keep to soft food and avoid chewing over the area entirely.',
      'No smoking, and no vigorous rinsing for the first 24 hours.',
    ],
    warningSigns: ['Loss of a large amount of graft material', 'Increasing pain, swelling or discharge'],
  },
  {
    condition: 'VENEER',
    title: 'Veneers',
    whatToExpect:
      'A very thin layer of the front surface is prepared and a custom facing is bonded on. Preparation is minimal and often needs little or no anaesthetic.',
    aftercare: [
      'Sensitivity to cold for a week or so after preparation is normal.',
      'Do not bite nails, pens, or open packaging with your teeth — porcelain is strong in function but chips under point loads.',
      'If you grind your teeth at night, wear the night guard you are given. Grinding is the most common way veneers are lost.',
      'Veneers do not change colour with whitening, so any whitening should be done before they are made.',
    ],
  },
  {
    condition: 'CLEANING',
    title: 'Cleaning and gum treatment',
    whatToExpect:
      'Hardened deposits are removed from above and below the gum line. Where there is gum disease this is done in quadrants and may be carried out under local anaesthetic.',
    aftercare: [
      'Gums may bleed and feel tender for a few days; keep brushing gently rather than avoiding the area, which prolongs it.',
      'Use warm salt-water rinses and any prescribed mouthwash.',
      'Some sensitivity and a feeling of gaps between the teeth is normal once deposits are removed.',
      'Attend the maintenance appointments you are given. Gum disease returns without them.',
    ],
  },
];

/** The guidance relevant to one plan, in the order the sections are defined. */
export function aftercareFor(conditions: Iterable<ToothCondition>): AftercareSection[] {
  const present = new Set(conditions);
  return AFTERCARE_SECTIONS.filter((s) => present.has(s.condition));
}

/** Advice that applies to any patient travelling for treatment, printed on every dossier. */
export const TRAVEL_GUIDANCE = {
  beforeYouTravel: [
    'Bring your passport, travel insurance details, and a list of any medication you take regularly.',
    'Tell us in advance about heart conditions, diabetes, blood thinners, bisphosphonates, or pregnancy — several of these change how treatment is planned.',
    'Arrange travel insurance that covers you for a planned medical trip; ordinary holiday cover often does not.',
    'Do not start a course of treatment elsewhere in the weeks before you travel unless we have agreed it.',
  ],
  duringYourStay: [
    'Keep the clinic number and your coordinator’s number saved in your phone.',
    'Come to surgical appointments having eaten normally unless you were told otherwise.',
    'Arrange for a companion to be with you after any sedation — you must not travel alone afterwards.',
    'Avoid alcohol while you are taking antibiotics or painkillers.',
  ],
  beforeYouFly: [
    'Do not book a return flight for the same day as surgery. Allow the recovery time your plan sets out.',
    'After a sinus lift or upper jaw surgery, flying may need to be delayed — confirm the date with your surgeon before booking.',
    'Carry any prescribed medication in your hand luggage with its documentation.',
    'Ask for a written summary of what was done, so a dentist at home can treat you if needed.',
  ],
} as const;
