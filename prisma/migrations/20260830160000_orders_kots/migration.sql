-- AlterTable
ALTER TABLE "kots" ADD COLUMN     "outlet_id" UUID NOT NULL,
ADD COLUMN     "ready_at" TIMESTAMP(3),
ADD COLUMN     "served_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "client_line_id" TEXT,
ADD COLUMN     "variant_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "guest_count" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "table_id" UUID;

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "option_id" UUID,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_item_modifiers_tenant_id_order_item_id_idx" ON "order_item_modifiers"("tenant_id", "order_item_id");

-- CreateIndex
CREATE INDEX "sequences_tenant_id_idx" ON "sequences"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_outlet_id_key_key" ON "sequences"("outlet_id", "key");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS for the new tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_item_modifiers','sequences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
