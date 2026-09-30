-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claimant" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "leave_type" TEXT,
    "status" TEXT NOT NULL,
    "assignee" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "pages" INTEGER,
    "received_at" DATE NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" BIGSERIAL NOT NULL,
    "claim_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "run_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "package" JSONB NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_status_history" (
    "id" BIGSERIAL NOT NULL,
    "claim_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "package_version" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_claims_status" ON "claims"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "packages_claim_id_version_key" ON "packages"("claim_id", "version");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
