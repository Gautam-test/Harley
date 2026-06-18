-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('PORTAL', 'DEALER');

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN "entrySource" "EnquirySource" NOT NULL DEFAULT 'PORTAL';
