import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Dental@2024!';

async function main() {
  console.log('Seeding database...');

  await prisma.clinicSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      clinicName: 'Dental Clinic',
      timezone: 'Europe/Istanbul',
      currency: 'USD',
    },
  });

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const users = [
    { email: 'superadmin@clinic.com', firstName: 'Super', lastName: 'Admin', role: Role.SUPER_ADMIN },
    { email: 'manager@clinic.com', firstName: 'Clinic', lastName: 'Manager', role: Role.CLINIC_MANAGER },
    { email: 'reception@clinic.com', firstName: 'Front', lastName: 'Desk', role: Role.RECEPTION },
    { email: 'sales@clinic.com', firstName: 'Sales', lastName: 'Consultant', role: Role.SALES_CONSULTANT },
    { email: 'dentist@clinic.com', firstName: 'Dr.', lastName: 'Dentist', role: Role.DENTIST, specialization: 'General Dentistry' },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
    console.log(`  ✓ ${user.role}: ${user.email}`);
  }

  // Treatment categories — the tooth-by-tooth planner picks from these. Upserted
  // by unique name so re-running the seed is idempotent and never duplicates.
  const treatmentCategories = [
    { name: 'Implant', description: 'Dental implant placement (fixture + abutment).' },
    { name: 'Crown', description: 'Full-coverage restoration cemented over a prepared tooth.' },
    { name: 'Veneer', description: 'Thin porcelain/composite shell bonded to the front of a tooth.' },
    { name: 'Root Canal', description: 'Endodontic treatment of the tooth pulp/root system.' },
    { name: 'Filling', description: 'Direct restoration of a decayed or damaged tooth.' },
    { name: 'Extraction', description: 'Removal of a tooth.' },
    { name: 'Bone Graft', description: 'Augmentation of jaw bone to support future implants.' },
    { name: 'Sinus Lift', description: 'Raising the sinus floor to allow upper-jaw implant placement.' },
    { name: 'Cleaning', description: 'Professional scaling and polishing (prophylaxis).' },
    { name: 'Whitening', description: 'Cosmetic tooth-shade lightening.' },
    { name: 'Orthodontic Treatment', description: 'Alignment of teeth with braces or clear aligners.' },
  ];

  const categoryByName = new Map<string, string>();
  for (const category of treatmentCategories) {
    const row = await prisma.treatmentCategory.upsert({
      where: { name: category.name },
      update: { description: category.description },
      create: category,
    });
    categoryByName.set(row.name, row.id);
  }
  console.log(`  ✓ ${treatmentCategories.length} treatment categories`);

  // Default warranty templates — clinic admins can edit durations/terms afterward.
  // Terms are snapshotted onto each Warranty at issue time, so later edits here
  // never retroactively change certificates already handed to patients.
  const warrantyTemplates = [
    {
      name: 'Implant Warranty',
      categoryName: 'Implant',
      durationMonths: 120,
      termsAndConditions:
        'The dental implant fixture is warranted against failure of osseointegration and manufacturing defects for the coverage period, provided the patient attends scheduled maintenance visits.',
      maintenanceRequirements: 'Professional cleaning every 6 months and annual implant check-up with radiographs.',
      exclusions: 'Damage from trauma, smoking-related failure, untreated gum disease, or failure to attend maintenance visits.',
      annualCheckupRequired: true,
    },
    {
      name: 'Crown Warranty',
      categoryName: 'Crown',
      durationMonths: 60,
      termsAndConditions:
        'Ceramic/porcelain crowns are warranted against fracture and de-cementation under normal use for the coverage period.',
      maintenanceRequirements: 'Routine cleaning every 6 months; avoid chewing extremely hard objects.',
      exclusions: 'Damage from accidents, bruxism without a night guard, or poor oral hygiene.',
      annualCheckupRequired: true,
    },
    {
      name: 'Veneer Warranty',
      categoryName: 'Veneer',
      durationMonths: 60,
      termsAndConditions:
        'Porcelain veneers are warranted against debonding and fracture under normal use for the coverage period.',
      maintenanceRequirements: 'Routine cleaning every 6 months; avoid biting hard objects and use a night guard if advised.',
      exclusions: 'Chips or debonding caused by trauma, nail-biting, or bruxism without protection.',
      annualCheckupRequired: false,
    },
    {
      name: 'Root Canal Warranty',
      categoryName: 'Root Canal',
      durationMonths: 24,
      termsAndConditions:
        'Endodontically treated teeth are warranted against re-infection requiring retreatment for the coverage period when restored with the recommended crown.',
      maintenanceRequirements: 'Place the recommended final restoration/crown within the advised timeframe and attend routine check-ups.',
      exclusions: 'Failure due to missing/delayed final restoration, new decay, or vertical root fracture.',
      annualCheckupRequired: false,
    },
  ];

  for (const template of warrantyTemplates) {
    const { categoryName, ...data } = template;
    await prisma.warrantyTemplate.upsert({
      where: { name: template.name },
      update: { ...data, treatmentCategoryId: categoryByName.get(categoryName) ?? null },
      create: { ...data, treatmentCategoryId: categoryByName.get(categoryName) ?? null },
    });
  }
  console.log(`  ✓ ${warrantyTemplates.length} warranty templates`);

  console.log(`\nAll seed users use password: ${SEED_PASSWORD}`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
