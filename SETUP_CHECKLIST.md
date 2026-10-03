# One-time setup checklist

The existing Notion Home page should stay as-is until the new dashboard is confirmed working.

## 1. Create the GitHub repository

Create a new repository on your GitHub account named:

`personal-dashboard`

Recommended for easiest automatic front-end updating: **Public** repository.

Do not add a README, .gitignore, or license during creation. Once the empty repository exists, send the repository URL back to ChatGPT. ChatGPT can then upload the prepared source files directly.

If you want the repository Private instead, that is fine, but Apps Script will need a read-only GitHub token in Script Properties so it can fetch `Index.html`.

## 2. Create a Notion internal integration

Create an internal Notion integration named:

`Personal Dashboard`

Give it permission to read content, insert content, and update content.

Copy the integration secret, but **do not paste the secret into ChatGPT**.

In Notion, connect the integration to the `System` page. The databases used by the dashboard live under System, including the newly created `Dashboard Settings` database.

## 3. Create a new Google Apps Script project

Create a brand-new standalone Apps Script project named:

`Personal Dashboard`

Do not replace the existing calendar project yet. Keeping the old project alive gives you a working fallback while this one is tested.

### Files to create in Apps Script

1. Replace the default `Code.gs` with the supplied `Code.gs`.
2. Add an HTML file named `Index` and paste the supplied `Index.html` into it.
3. In Project Settings, enable `Show appsscript.json manifest file in editor`.
4. Replace the manifest with the supplied `appsscript.json`.

## 4. Add Script Properties

In Apps Script open:

`Project Settings -> Script Properties`

Add these properties:

- `EMBED_KEY` = a long random private string
- `NOTION_TOKEN` = the Notion internal integration secret from step 2
- `GITHUB_REPO` = `julyringle/personal-dashboard`
- `GITHUB_BRANCH` = `main`
- `USE_GITHUB_FRONTEND` = `true`
- `CALENDAR_IDS` = `primary`

Do not add `GITHUB_TOKEN` if the repository is public.

If the repository is private, also add:

- `GITHUB_TOKEN` = a fine-grained GitHub token with read-only Contents access to only this repository

## 5. Run once from the Apps Script editor

Select `getBootstrapData` and click Run.

Google will ask for permissions for Calendar, Sheets, and external requests. Approve them.

If the Notion connection is correct, the function should finish without a permission error from Notion.

## 6. Deploy the web app

In Apps Script:

`Deploy -> New deployment -> Web app`

Use:

- Execute as: `Me`
- Who has access: `Anyone`

Deploy and copy the `/exec` web app URL.

The dashboard URL will be:

`YOUR_EXEC_URL?key=YOUR_EMBED_KEY`

The Collections-first version is:

`YOUR_EXEC_URL?key=YOUR_EMBED_KEY&view=collections`

Do not publish either full URL publicly because the embed key is the access gate for your personal dashboard.

## 7. Send only the web-app URL back to ChatGPT

Send ChatGPT the base `/exec` URL only. You do not need to send the Notion token or embed key.

Once the dashboard is verified, ChatGPT can:

- replace the current Home content with the custom dashboard embed
- update the Collections & Wishlist page to open/embed the Collections view
- preserve System and Archive as native fallback/admin pages
- remove the old temporary Home blocks after verification

## 8. Future edits

Normal data changes do not require a deployment:

- edit Google Sheets -> Collections updates automatically
- edit Notion -> Home data updates automatically
- edit Dashboard Settings -> colors/modules/settings update automatically

For front-end design changes, ChatGPT edits `Index.html` in GitHub. Apps Script pulls the new GitHub version automatically (cached for up to 5 minutes), so most future visual changes do not need another Apps Script deployment.

Only server-side feature changes to `Code.gs` require you to paste the updated backend file and deploy a new Apps Script version.