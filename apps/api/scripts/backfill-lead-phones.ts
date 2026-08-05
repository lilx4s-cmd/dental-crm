/**
 * Canonicalises stored phone numbers on existing leads (Q4c).
 *
 * Why this is a script you run and read, rather than part of the migration: the 1,005 leads
 * already on file have no country, and inventing one for them is exactly the mistake the country
 * column exists to prevent. So this reports before it writes, and only ever writes the changes it
 * can justify.
 *
 * What it does, and does not do:
 *
 *   - **Reformats, never re-routes.** A number is only rewritten when doing so does not change
 *     which country it dials. `0555 111 22 33` stored with no country stays as it is; it is
 *     reported for review instead, because turning it into +90 would be guessing.
 *   - **Lists duplicates, and does not merge them.** Merging is a judgement about which deal is
 *     the real one and which salesperson keeps the commission; the app already has a merge tool
 *     for that, with a human in front of it.
 *
 * Usage:
 *   npx ts-node scripts/backfill-lead-phones.ts            # dry run, writes nothing
 *   npx ts-node scripts/backfill-lead-phones.ts --apply    # writes the safe changes only
 */
import { PrismaClient } from '@prisma/client';
import { normalisePhoneNumber, phoneMatchKey } from '@dental-crm/shared';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface Row {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  country: string | null;
}

/**
 * A rewrite is safe only when it does not change the dialled destination.
 *
 * In practice that means the stored value already carries a country code and merely needs its
 * punctuation stripped. Anything that would *add* a country code is a routing decision, and this
 * script does not make routing decisions.
 */
function safeRewrite(stored: string, country: string | null): string | null {
  const digits = stored.replace(/\D/g, '');
  if (!digits) return null;

  // A local-format number with no country cannot be resolved without guessing. Leave it.
  if (digits.startsWith('0') && !country) return null;

  const normalised = normalisePhoneNumber(stored, country);
  if (!normalised) return null;

  // Only accept the rewrite if the trailing digits are unchanged — that is what proves it is the
  // same subscriber and not a number that has acquired a different prefix.
  if (phoneMatchKey(stored, country) !== phoneMatchKey(normalised.e164, country)) return null;
  return normalised.e164 === stored ? null : normalised.e164;
}

async function main() {
  const leads: Row[] = await prisma.lead.findMany({
    where: { mergedIntoId: null },
    select: { id: true, firstName: true, lastName: true, phone: true, whatsappNumber: true, country: true },
    orderBy: { createdAt: 'asc' },
  });

  const rewrites: Array<{ id: string; phone?: string; whatsappNumber?: string }> = [];
  const needsCountry: Row[] = [];
  const byKey = new Map<string, Row[]>();

  for (const lead of leads) {
    const phone = lead.phone ? safeRewrite(lead.phone, lead.country) : null;
    const whatsapp = lead.whatsappNumber ? safeRewrite(lead.whatsappNumber, lead.country) : null;
    if (phone || whatsapp) {
      rewrites.push({
        id: lead.id,
        ...(phone ? { phone } : {}),
        ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
      });
    }

    // Local-format and no country: unresolvable, and currently being dialled as Turkish.
    const localWithNoCountry = [lead.phone, lead.whatsappNumber].some(
      (n) => n && n.replace(/\D/g, '').startsWith('0') && !lead.country,
    );
    if (localWithNoCountry) needsCountry.push(lead);

    for (const n of [lead.phone, lead.whatsappNumber]) {
      const key = n ? phoneMatchKey(n, lead.country) : null;
      if (!key || key.length < 7) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      const bucket = byKey.get(key)!;
      if (!bucket.some((l) => l.id === lead.id)) bucket.push(lead);
    }
  }

  const duplicates = [...byKey.entries()].filter(([, members]) => members.length > 1);

  console.log(`leads examined:                 ${leads.length}`);
  console.log(`safe format-only rewrites:      ${rewrites.length}`);
  console.log(`need a country before they can be dialled correctly: ${needsCountry.length}`);
  console.log(`duplicate groups by phone:      ${duplicates.length}`);

  if (needsCountry.length) {
    console.log('\nThese are stored in local format with no country, so they are currently dialled');
    console.log('as Turkish. Set the country on each, or confirm Turkey is right:\n');
    for (const l of needsCountry.slice(0, 40)) {
      console.log(`  ${l.id}  ${`${l.firstName} ${l.lastName ?? ''}`.trim().padEnd(28)} ${l.phone ?? l.whatsappNumber}`);
    }
    if (needsCountry.length > 40) console.log(`  … and ${needsCountry.length - 40} more`);
  }

  if (duplicates.length) {
    // Worth knowing why these exist: most are byte-identical stored strings, which means the
    // duplicate check never saw them rather than that it compared them wrongly. It guards the
    // create path only, and these arrived through the Bitrix migration, which writes directly.
    console.log('\nSame number on more than one deal. Merge them in the app — merging is a judgement');
    console.log('about which deal is real and whose commission it is, so this script will not:\n');
    for (const [key, members] of duplicates.slice(0, 20)) {
      console.log(`  …${key}: ${members.map((m) => `${m.firstName} ${m.lastName ?? ''}`.trim()).join(' | ')}`);
    }
    if (duplicates.length > 20) console.log(`  … and ${duplicates.length - 20} more`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to make the safe rewrites above.');
    return;
  }

  for (const change of rewrites) {
    const { id, ...data } = change;
    await prisma.lead.update({ where: { id }, data });
  }
  console.log(`\nApplied ${rewrites.length} format-only rewrites. Nothing else was changed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
