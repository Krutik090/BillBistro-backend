-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('FREE', 'OCCUPIED', 'RESERVED', 'BILLED', 'CLEANING', 'BLOCKED');

-- CreateTable
CREATE TABLE "floor_sections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "floor_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',
    "status_since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_order_id" UUID,
    "pos_x" INTEGER NOT NULL DEFAULT 0,
    "pos_y" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_sections_tenant_id_outlet_id_idx" ON "floor_sections"("tenant_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "floor_sections_outlet_id_name_key" ON "floor_sections"("outlet_id", "name");

-- CreateIndex
CREATE INDEX "tables_tenant_id_outlet_id_status_idx" ON "tables"("tenant_id", "outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_outlet_id_code_key" ON "tables"("outlet_id", "code");

-- AddForeignKey
ALTER TABLE "floor_sections" ADD CONSTRAINT "floor_sections_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "floor_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS for the new tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['floor_sections','tables'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
