# Personal Dashboard

Private personal dashboard with a custom GitHub Pages frontend and Google-backed data.

## Current architecture

- **GitHub Pages** hosts the visible dashboard.
- **GitHub** stores the HTML, CSS, JavaScript, backgrounds, icons, and source code.
- **Google OAuth** protects access to the private backend.
- **Google Apps Script API Executable** runs the dashboard backend.
- **Google Sheets** stores dashboard data and the collection sheets.
- **Google Calendar** supplies calendar events.

No private dashboard data or Google access tokens are stored in this repository.

## Main data store

The private `Personal Dashboard Data` spreadsheet contains:

- Settings
- Tasks
- Projects
- Health
- Habits
- HabitHistory
- Notes

The collection pages also read their existing Google Sheets for Wishlist, Soccer Kits, Pokémon, and One Piece.

## Frontend

The standalone site is served from:

`https://julyringle.github.io/personal-dashboard/`

The same frontend code can still run inside Apps Script while the legacy web-app deployment is retained as a fallback.

## Backend configuration

Apps Script Script Properties used by the current setup include:

- `DASHBOARD_DATA_SHEET_ID`
- `CALENDAR_IDS`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `USE_GITHUB_FRONTEND`

The standalone browser client uses the public OAuth Client ID and Apps Script Script ID. These are identifiers, not secrets.

Do not commit OAuth client secrets, access tokens, Apps Script embed keys, or other private credentials to GitHub.

## Updating

Frontend changes can be committed to GitHub at any time. Backend changes are made in `Code.gs` and then copied/deployed to the Apps Script project when needed. Keep the API Executable deployment available because the GitHub Pages dashboard uses it for backend calls.
