
Focus Bubble


---

What

A Chrome extension that tracks your LeetCode solves and time and syncs scores to a Firebase leaderboard.
Designed for batch-based competition, not global streaks.


---

Why

LeetCode leaderboards are global.
Focus Bubble keeps it local and motivating—so classmates or teammates can compete, stay accountable, and build consistency together.


---

How

Track: Auto-timer on problem pages, instant solve detection

Score: Easy 50 / Medium 100 / Hard 200, bonuses for fast solves, penalties for inactivity

Sync: Firebase backend updates a real-time leaderboard

Use: Popup shows score, recent solves, and sync controls



---

Install

1. Clone or download the repo


2. Go to chrome://extensions/ → enable Developer mode


3. Click Load unpacked → select the folder


4. Add your Firebase config in background.js and set database rules




---

Security

Current build exposes Firebase keys.
Use only in trusted testing until the secure backend proxy is released.


---

License

MIT


