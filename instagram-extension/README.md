# Instagram Web Capture

This unpacked Chrome/Edge extension detects Like and Save controls on Instagram Web reels, confirms the action from Instagram's `xig_media_like` or `xig_media_save` GraphQL response, asks the configured FastAPI backend to index the reel, and transfers the transcript and embedding into the signed-in Reel Library browser account. Completed items remain queued in extension storage until the library tab accepts them.

## Install

1. Run the FastAPI backend and make it reachable from the browser. For Instagram on the same computer, a local backend URL such as `http://localhost:8000` works. For a Vercel app, the backend must have a public HTTPS URL or an active HTTPS tunnel.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose this `instagram-extension` folder.
4. Open the extension's settings popup. Enter the backend base URL and the Reel Library app URL, then select **Save settings** and grant the requested site permissions.
5. Reload Instagram and the Reel Library tab. Sign in to the Reel Library app, then like or save a reel on Instagram Web.

Use the exact app origin, with no path, for example `https://your-library.vercel.app` or `http://localhost:3000`. The extension only watches Instagram Web; it does not run inside the Instagram mobile app. After changing extension code, click **Reload** for the extension in the browser extensions page and reload Instagram. Instagram may change its GraphQL operation names or response format, which can require an extension update.

The backend currently accepts indexing requests without server-side user authentication. Keep a laptop tunnel private and temporary, or add authenticated access before exposing the API as a permanent public service. The Reel Library login remains local to the browser and is not backend authentication.