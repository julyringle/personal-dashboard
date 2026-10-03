# Personal Noir Dashboard

A private personal dashboard designed for a Notion embed. It keeps Notion and Google Sheets as the data sources, while the interface is custom HTML/CSS/JS with a dark Batman / Blade Runner-inspired visual system.

## What is already wired

- Google Calendar week view, Monday-Sunday, 9 AM-midnight by default
- Midnight-start events shown in a bottom 12 AM rail
- Quick Capture for tasks, school tasks, notes, and Wishlist items
- Habit toggles with same-day undo
- Focus tasks from the Notion Tasks data source
- Health summary from Notion Check-Ins
- School task summary
- Active project summary
- Collections app with:
  - Wishlist from `Wishlist & Future Buys`
  - Soccer kits from `Soccer Kits`, including the sheet's team colors and IMAGE formulas
  - Pokemon by Generation from `pokemon_living_dex`
  - One Piece by binder page from `One Piece TCG`

## Source of truth

- Tasks / school / notes / projects / habits / health: Notion
- Calendar: Google Calendar
- Wishlist / soccer / Pokemon / One Piece: Google Sheets
- Appearance and module settings: Notion `Dashboard Settings`
- Front-end source: GitHub `Index.html`
- Private server / API bridge: Google Apps Script `Code.gs`

## Files

- `Code.gs`: server-side Apps Script. Holds no secret values in the file.
- `Index.html`: full custom front end. Apps Script can pull the latest version from GitHub automatically.
- `appsscript.json`: Apps Script manifest and scopes.
- `SETUP_CHECKLIST.md`: one-time setup instructions.

## Security

Never commit your Notion integration token or Apps Script embed key to GitHub. Store them only in Apps Script Script Properties.

The public/private GitHub choice affects only source visibility. The repository does not need any Notion or Google secret in it.