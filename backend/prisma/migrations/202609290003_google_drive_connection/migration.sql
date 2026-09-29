CREATE TABLE "GoogleDriveConnection" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleDriveConnection_email_key"
  ON "GoogleDriveConnection"("email");
