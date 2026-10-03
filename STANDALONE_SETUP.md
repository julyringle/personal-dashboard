# Standalone private dashboard (GitHub Pages + Apps Script API)

This removes the blue Google Apps Script banner by serving the UI from GitHub Pages while keeping data access protected by Google OAuth.

## GitHub Pages

In the GitHub repository:
1. Settings → Pages.
2. Build and deployment → Source: **Deploy from a branch**.
3. Branch: **main**.
4. Folder: **/(root)**.
5. Save.

The site URL will be:
https://julyringle.github.io/personal-dashboard/

## Google Cloud / Apps Script one-time setup

1. Create or choose a **standard Google Cloud project**.
2. Enable the **Google Apps Script API** in that Cloud project.
3. Configure the Google Auth Platform / OAuth consent screen.
   - Personal Gmail: External → Testing, and add your own Google account as a test user.
   - Workspace account: Internal can be used when available.
4. Create an OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized JavaScript origin: **https://julyringle.github.io**
   - Copy the Client ID.
5. In Apps Script → Project Settings, link the script to the same standard Google Cloud project. Google asks for the Cloud project **number**, not the project ID.
6. Apps Script → Deploy → New deployment → **API executable**.
7. Set access to only yourself / the authorized user and deploy.
8. Copy the API executable deployment ID.

## First standalone launch

Open:
https://julyringle.github.io/personal-dashboard/

The first time on a device, enter:
- OAuth Client ID
- API executable deployment ID

Then tap **Sign in with Google**.

Those IDs are not passwords. The page stores them only in that browser. Google OAuth still controls access to Calendar and Sheets.

After the app works, add the GitHub Pages URL to the iPhone Home Screen. The Google Apps Script banner will not be present because the visible UI is no longer hosted by Apps Script.

## Notes

- Keep the existing private Apps Script web-app deployment as a fallback while testing.
- Do not make the Apps Script backend anonymously accessible just to remove the banner.
- The GitHub repository can stay public because the frontend contains no private dashboard data or access token.
- OAuth access tokens are short-lived. The standalone app may occasionally ask for one tap on **Sign in with Google** again.
