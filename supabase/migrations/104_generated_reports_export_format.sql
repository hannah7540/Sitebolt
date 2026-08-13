-- Track export format for Administration Reporting history

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS export_format text NOT NULL DEFAULT 'excel';

COMMENT ON COLUMN generated_reports.export_format IS 'Original export format: pdf or excel (csv spreadsheet)';
