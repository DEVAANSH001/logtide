-- ============================================================================
-- LogTide - Source Map Original Frame Columns
-- ============================================================================
-- Migration: 031_add_original_frame_columns.sql
-- Description: Add original (pre-minification) location columns to stack_frames.
--              When source maps are available, frames store both minified and
--              original locations for debugging and display.
-- ============================================================================

ALTER TABLE stack_frames ADD COLUMN IF NOT EXISTS original_file TEXT;
ALTER TABLE stack_frames ADD COLUMN IF NOT EXISTS original_line INT;
ALTER TABLE stack_frames ADD COLUMN IF NOT EXISTS original_column INT;
ALTER TABLE stack_frames ADD COLUMN IF NOT EXISTS original_function TEXT;
