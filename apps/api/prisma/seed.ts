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

  console.log(`\nAll seed users use password: ${SEED_PASSWORD}`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
