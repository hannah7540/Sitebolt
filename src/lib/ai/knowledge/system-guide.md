# Site-Bolt Application Training & Operating Guide

## 1. Plant & Fleet Management
- **Calendar Overrides:** Admins can click on Current Hours or Next Service Due hours directly on the plant calendar cards to manually update meter readings. A confirmation prompt is required before saving.
- **Pre-start Checks:** Pre-start checks are logged daily by operators. If an error is flagged, it displays an amber or red badge on the calendar.
- **Maintenance Scheduling:** Clicking on a plant unit ID opens the asset modal where maintenance logs can be added, reviewed, or closed out.

## 2. SWMS & Safety Compliance
- **Creating & Uploading SWMS:**
  - Standard internal SWMS are generated and edited under Safety > SWMS.
  - External / Builder SWMS: Click "Upload External SWMS" on the Organisation or Project SWMS page. Attach the builder's PDF document and specify the company name.
- **Assigning SWMS:**
  - Select one or multiple SWMS checkboxes, then click "Send to Guest" or "Assign Workers".
  - Guest links dispatch an automated email with an orange "Open SWMS Portal" button where external subcontractors can review and sign the document on a mobile-friendly canvas without an account.
- **Audit Logs & Signatures:** Every signed SWMS logs worker name, date, time, and signature data.

## 3. Accounts & Timesheets
- **Verification Workflow:** Admins can review weekly hours in Accounts > Timesheets.
- **Checked Status:** Admins bulk-select worker rows and click "Mark as Checked", placing a green tick in the Checked column to the left of Approved.
- **Final Approval:** Timesheets must be marked Checked prior to final payroll sign-off.

## 4. 1-Click Document Pack
- **Scope:** Defaults to Company-Wide, or can be filtered by specific Projects.
- **Excel Export (.xlsx):** Exports a single workbook with three tabs:
  1. Plant (hours, next service, last maintenance, last pre-start, current assignment).
  2. SWMS (scope, signed list with dates, unsigned list).
  3. ITP / ITC (site, stage: Inputted, In Progress, Completed).
- **PDF Export:** Consolidates complete SWMS documents (including merged external builder PDFs) followed by signature logs, single-page plant breakdowns, and ITC records.
