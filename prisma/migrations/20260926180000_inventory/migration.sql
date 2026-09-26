-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'ADJUST', 'DEDUCT');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock_milli" INTEGER NOT NULL DEFAULT 0,
    "low_stock_milli" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty_milli" INTEGER NOT NULL,
    "balance_milli" INTEGER NOT NULL,
    "reason" TEXT,
    "kot_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "qty_milli" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_idx" ON "inventory_items"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenant_id_name_key" ON "inventory_items"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_inventory_item_id_created_at_idx" ON "stock_movements"("tenant_id", "inventory_item_id", "created_at");

-- CreateIndex
CREATE INDEX "recipe_lines_tenant_id_menu_item_id_idx" ON "recipe_lines"("tenant_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_lines_menu_item_id_inventory_item_id_key" ON "recipe_lines"("menu_item_id", "inventory_item_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS for the new tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items','stock_movements','recipe_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
