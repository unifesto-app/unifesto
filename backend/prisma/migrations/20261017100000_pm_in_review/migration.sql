-- Product board: PR open, waiting on a human to merge.
ALTER TYPE "PmTaskStatus" ADD VALUE 'IN_REVIEW' AFTER 'BLOCKED';
