-- Add new sub-space request types for parent/child management
ALTER TYPE "sub_space_request_type" ADD VALUE IF NOT EXISTS 'CONVERT_TO_REGULAR';
ALTER TYPE "sub_space_request_type" ADD VALUE IF NOT EXISTS 'REMOVE_CHILD';
ALTER TYPE "sub_space_request_type" ADD VALUE IF NOT EXISTS 'REMOVE_PARENT';
