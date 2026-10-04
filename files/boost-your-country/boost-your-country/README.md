# Boost Your Country

A 9:16 live-stream game. Viewers type their country in your YouTube live chat and their flag climbs the board.

## Deploy once (you)
1. Create a new GitHub repo and upload everything in this folder. Keep `api/chat.js` inside the `api` folder.
2. Go to vercel.com, sign in with GitHub, choose Add New > Project, pick the repo and press Deploy. No settings needed.
3. Share the Vercel link (for example `https://your-project.vercel.app`) with your friends.

GitHub Pages will not work because the chat reader (`api/chat.js`) needs Vercel.

## Play (your friends, on their phone)
1. Start a YouTube live stream.
2. Open the shared link, paste the live link, pick English or Telugu, tap Start game.
3. Stream the phone screen with a screen-streaming app, or use OBS on a PC. Keep the game on screen.

## Points
- Comment with a country name or flag: the viewer's level in points (Lv 1 to 5, level up every 8 chats). Later comments keep boosting the same country.
- Viewer types "like" or "liked": +150. "subscribe" or "sub": +250. "share" or "shared": +200 (once each per viewer).
- Super Chat: 10 points per currency unit, minimum 100.

## Optional
Add an environment variable `YT_API_KEY` (YouTube Data API v3 key) in Vercel as a backup chat reader.
