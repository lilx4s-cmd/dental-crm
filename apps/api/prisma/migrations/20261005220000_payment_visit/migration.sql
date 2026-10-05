ALTER TABLE payments ADD COLUMN "visitNumber" INTEGER;
ALTER TABLE payments ADD CONSTRAINT payment_visit_check CHECK ("visitNumber" IS NULL OR "visitNumber" IN (1,2));
