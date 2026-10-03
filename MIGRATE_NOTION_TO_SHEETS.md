# Move the Personal Dashboard off Notion

The current dashboard can use a private Google Sheets datastore instead of Notion.

## One-time migration

1. Copy the latest `Code.gs` from this repository into the Apps Script project and save it.
2. In Apps Script, select and run `migrateOffNotion`.
3. Approve Google Sheets access if prompted.
4. The function creates a private spreadsheet named **Personal Dashboard Data**, migrates Settings, Tasks, Projects, Health, Habits, Habit History, and Notes, and sets the Script Property `DATA_BACKEND=sheets`.
5. Run `validateSheetsBackend` and confirm it completes successfully.
6. Deploy a new web-app version.
7. Set **Execute as: Me** and **Who has access: Only myself**.
8. Keep the existing dashboard query key on the web-app URL.
9. Run `clearFrontendCache`, then test Home, Habits, Health, School, Projects, Collections, and Calendar.
10. Only after testing, remove `NOTION_TOKEN` from Script Properties. Keep the old Notion databases temporarily as a backup.

The new spreadsheet ID is stored only in Apps Script Script Properties as `DASHBOARD_DATA_SHEET_ID`; it is not hard-coded into the public GitHub frontend.
