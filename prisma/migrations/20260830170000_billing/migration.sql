-- AlterEnum
ALTER TYPE "BillStatus" ADD VALUE 'SETTLED';

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "business_date" TEXT,
ADD COLUMN     "cgst" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "client_key" TEXT,
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "discount_note" TEXT,
ADD COLUMN     "merged_order_ids" UUID[],
ADD COLUMN     "paid_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refund_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settled_at" TIMESTAMP(3),
ADD COLUMN     "sgst" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "split_count" INTEGER,
ADD COLUMN     "split_index" INTEGER,
ADD COLUMN     "taxable" INTEGER NOT NULL,
ADD COLUMN     "tip" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "business_date" TEXT,
ADD COLUMN     "received_by_id" UUID,
ADD COLUMN     "refunded_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tendered" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'CAPTURED';

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "order_item_id" UUID,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "taxable" INTEGER NOT NULL,
    "tax_rate_bps" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL DEFAULT 0,
    "sgst" INTEGER NOT NULL DEFAULT 0,
    "hsn_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "idempotency_key" TEXT,
    "business_date" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_closes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "totals" JSONB NOT NULL,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_lines_tenant_id_bill_id_idx" ON "bill_lines"("tenant_id", "bill_id");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_bill_id_idx" ON "refunds"("tenant_id", "bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_tenant_id_idempotency_key_key" ON "refunds"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "day_closes_tenant_id_outlet_id_idx" ON "day_closes"("tenant_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_closes_outlet_id_business_date_key" ON "day_closes"("outlet_id", "business_date");

-- CreateIndex
CREATE INDEX "bills_tenant_id_outlet_id_business_date_idx" ON "bills"("tenant_id", "outlet_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "bills_tenant_id_client_key_key" ON "bills"("tenant_id", "client_key");

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS for the new tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bill_lines','refunds','day_closes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
