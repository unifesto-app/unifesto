-- Product board: free-form task labels ("mobile", "launch", "bug").
ALTER TABLE "pm_tasks" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "pm_tasks_labels_idx" ON "pm_tasks" USING GIN ("labels");
