# Focus Bubble

Focus Bubble is an open-source Chrome extension developed by **QuantumQuest**.  
that tracks your LeetCode progress and syncs it to a Firebase-powered leaderboard.  
Originally designed as a productivity tool, it now focuses on **batch-based competition** — helping students motivate each other by comparing solves and scores in real time.  

---

## 🎯 Purpose  

Of course, LeetCode already has a leaderboard, daily streaks, and global tracking.  
So, what’s the purpose of this extension?  

👉 **Focus Bubble is built for students within specific batches.**  
The goal is to **encourage friendly competition, motivation, and consistency** inside a community, not just individual streaks.  

- 👥 Compare progress with peers in the same batch  
- 🔥 Stay accountable through a shared leaderboard  
- 🚀 Motivate each other to solve more problems together  

Unlike LeetCode’s global leaderboard, Focus Bubble creates a **batch-focused motivation system** tailored for learning groups.  

---

## ✨ Features
- **LeetCode Progress Tracking**:
  - **Timer**: Automatically tracks time spent on LeetCode problem pages, including `/description/`.
  - **Solve Detection**: Records successful submissions when `<span data-e2e-locator="submission-result">Accepted</span>` is detected.
  - **Scoring System**: Awards points based on problem difficulty (Easy: 50, Medium: 100, Hard: 200), with bonuses for solves under 15 minutes and penalties for solves over 1 hour.
  - **Firebase Integration**: Syncs solves, scores, and leaderboard data with Firebase Realtime Database.
  - **Leaderboard**: Displays user rankings, scores, and solve counts compared to others.
  - **Daily Penalty**: Deducts 150 points for days without solves (applied at 9 PM UTC).
- **User Interface**: View total score, recent solves, active timer, and sync status via a popup.
- **Sync Options**: Toggle auto-sync with Firebase or manually trigger syncs.
- **Open-Source**: Fully transparent codebase to foster community-driven development.

---

## ⚠️ Security Notice  

This project currently exposes **Firebase credentials and authentication logic** in the frontend, which is **not secure for public use**.  

We are actively working on creating a **secure backend proxy** between the extension and the Firebase database to ensure that:  

- 🔒 Firebase credentials remain hidden and protected.  
- 🔒 Only authorized extension requests are processed.  
- 🔒 Users cannot tamper with leaderboard data.  

At this stage, the code is uploaded for **testing purposes only** within a **trusted group or personal environment**.  

🚫 **Do not use this in production or share it publicly until the backend proxy is implemented.**  

---

## 🛠️ Installation
1. Clone or download the repository from GitHub.
2. In Chrome, navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right.
4. Click **Load unpacked** and select the extension folder.
5. Ensure Firebase SDK scripts (`Firebase-App.js`, `Firebase-Auth.js`, `Firebase-Database.js`) are included in the extension directory.

---

## ⚙️ Setup
1. **Firebase Configuration**:
   - Update `background.js` with your Firebase project’s `firebaseConfig` (apiKey, authDomain, databaseURL, etc.).
   - Configure Firebase Realtime Database rules to allow authenticated access:
     ```json
     {
       "rules": {
         ".read": "auth != null",
         ".write": "auth != null",
         "users": {
           "$uid": {
             ".read": "auth.uid === $uid",
             ".write": "auth.uid === $uid"
           }
         },
         "leaderboard": {
           "$uid": {
             ".read": "auth != null && auth.uid === $uid",
             ".write": "auth != null && auth.uid === $uid"
           }
         }
       }
     }
     ```
2. **Authentication**:
   - Open the options page to input your Firebase auth token and username.
   - Use the **Test Connection** feature in the popup to verify Firebase connectivity.

---

## 🚀 Usage
- **Tracking LeetCode Progress**:
  - Navigate to a LeetCode problem (e.g., `https://leetcode.com/problems/reverse-integer/`).
  - The timer starts automatically on problem or `/description/` pages.
  - Submit a solution; a notification displays points earned upon "Accepted" status.
- **Popup Interface**:
  - Access the extension popup to view your score, recent solves, timer status, and sync controls.
  - Use **Sync Now** for manual Firebase syncs or enable auto-sync in options.
  - Clear pending syncs with **Clear Queue.**
- **Leaderboard**: Compare your score and solve count with other users via Firebase data.

---

## 📂 Files
- **`content.js`**: Detects LeetCode problem pages, starts timers, identifies "Accepted" submissions, and communicates with `background.js`.
- **`background.js`**: Manages timers, stores solve data, syncs with Firebase, calculates scores, and applies daily penalties.
- **`popup.js`**: Powers the popup UI for displaying stats and managing syncs.
- **`options.js`**: Handles user configuration (username, auth token, auto-sync).
- **`popup.html`**: Renders the popup interface.
- **`options.html`**: Renders the options interface.
- **`manifest.json`**: Defines the extension’s configuration.
- **`Firebase-*.js`**: Firebase SDK scripts for authentication and database operations.

---

## 🐛 Debugging
- **Logs**: Inspect logs in DevTools (`chrome://extensions`, "Inspect background page" or content scripts).
- **Common Issues**:
  - **False Solve Detection**: An ignore list in `content.js` filters patterns like `/Debugging.*Submit.*Streaks.*Ready to Practice/`.
  - **Timer Issues**: Ensure `content.js` permits timers on `/description/` pages.
  - **Sync Failures**: Verify Firebase token, database URL, and rules in `background.js`.
  - **Score Mismatch**: Confirm `background.js` fetches Firebase stats in `send_stats`.
- **Key Logs**:
  - `content.js`: "🎉 SOLVE DETECTED", "⏱️ Timer started".
  - `background.js`: "✅ Synced local storage", "❌ Sync failed".

---

## 🤝 Contributing
- QuantumQuest encourages community contributions to refine Focus Bubble.  
- Submit bug reports or feature requests via GitHub Issues.  
- Provide pull requests for bug fixes or enhancements, ensuring tests on LeetCode problem and submission pages.  
- Focus on improving LeetCode tracking or laying groundwork for future productivity features.  

---

## 📅 Roadmap
- [ ] Implement **backend proxy** to secure Firebase communications.  
- [ ] Add **per-user authentication** for safer leaderboard interactions.  
- [ ] Introduce **productivity monitoring features** such as session metrics and solve-time analytics.  
- [ ] Integrate QuantumQuest’s **automation framework capabilities**.  
- [ ] Prepare for public release following community feedback and testing.  

---

## 📄 License
MIT License. See `LICENSE` for details.  

---

## 👥 About QuantumQuest
QuantumQuest is a team of developers creating an innovative automation framework.  
Focus Bubble, an open-source Chrome extension, enhances LeetCode progress tracking and serves as a foundation for future productivity tools.  

By releasing Focus Bubble as open-source, QuantumQuest aims to foster collaboration and deliver value to the developer community ahead of the automation framework’s launch.  - **Firebase Integration**: Syncs solves, scores, and leaderboard data with Firebase Realtime Database.
  - **Leaderboard**: Displays user rankings, scores, and solve counts compared to others.
  - **Daily Penalty**: Deducts 150 points for days without solves (applied at 9 PM UTC).
- **User Interface**: View total score, recent solves, active timer, and sync status via a popup.
- **Sync Options**: Toggle auto-sync with Firebase or manually trigger syncs.
- **Open-Source**: Fully transparent codebase to foster community-driven development.

## Installation
1. Clone or download the repository from GitHub.
2. In Chrome, navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the extension folder.
5. Ensure Firebase SDK scripts (`Firebase-App.js`, `Firebase-Auth.js`, `Firebase-Database.js`) are included in the extension directory.

## Setup
1. **Firebase Configuration**:
   - Update `background.js` with your Firebase project’s `firebaseConfig` (apiKey, authDomain, databaseURL, etc.).
   - Configure Firebase Realtime Database rules to allow authenticated access:
     ```json
     {
       "rules": {
         ".read": "auth != null",
         ".write": "auth != null",
         "users": {
           "$uid": {
             ".read": "auth.uid === $uid",
             ".write": "auth.uid === $uid"
           }
         },
         "leaderboard": {
           "$uid": {
             ".read": "auth != null && auth.uid === $uid",
             ".write": "auth != null && auth.uid === $uid"
           }
         }
       }
     }
     ```
2. **Authentication**:
   - Open the options page to input your Firebase auth token and username.
   - Use the "Test Connection" feature in the popup to verify Firebase connectivity.

## Usage
- **Tracking LeetCode Progress**:
  - Navigate to a LeetCode problem (e.g., `https://leetcode.com/problems/reverse-integer/`).
  - The timer starts automatically on problem or `/description/` pages.
  - Submit a solution; a notification displays points earned upon "Accepted" status.
- **Popup Interface**:
  - Access the extension popup to view your score, recent solves, timer status, and sync controls.
  - Use "Sync Now" for manual Firebase syncs or enable auto-sync in options.
  - Clear pending syncs with "Clear Queue."
- **Leaderboard**: Compare your score and solve count with other users via Firebase data.

## Files
- **`content.js`**: Detects LeetCode problem pages, starts timers, identifies "Accepted" submissions, and communicates with `background.js`.
- **`background.js`**: Manages timers, stores solve data, syncs with Firebase, calculates scores, and applies daily penalties.
- **`popup.js`**: Powers the popup UI for displaying stats and managing syncs.
- **`options.js`**: Handles user configuration (username, auth token, auto-sync).
- **`popup.html`**: Renders the popup interface.
- **`options.html`**: Renders the options interface.
- **`manifest.json`**: Defines the extension’s configuration.
- **`Firebase-*.js`**: Firebase SDK scripts for authentication and database operations.

## Debugging
- **Logs**: Inspect logs in DevTools (`chrome://extensions`, "Inspect background page" or content scripts).
- **Common Issues**:
  - **False Solve Detection**: An ignore list in `content.js` filters patterns like `/Debugging.*Submit.*Streaks.*Ready to Practice/`.
  - **Timer Issues**: Ensure `content.js` permits timers on `/description/` pages.
  - **Sync Failures**: Verify Firebase token, database URL, and rules in `background.js`.
  - **Score Mismatch**: Confirm `background.js` fetches Firebase stats in `send_stats`.
- **Key Logs**:
  - `content.js`: "🎉 SOLVE DETECTED", "⏱️ Timer started".
  - `background.js`: "✅ Synced local storage", "❌ Sync failed".

## Contributing
- QuantumQuest encourages community contributions to refine Focus Bubble.
- Submit bug reports or feature requests via GitHub Issues.
- Provide pull requests for bug fixes or enhancements, ensuring tests on LeetCode problem and submission pages.
- Focus on improving LeetCode tracking or laying groundwork for future productivity features.

## Roadmap
- Introduce productivity monitoring features, such as session focus metrics and solve time analytics.

## License
MIT License. See `LICENSE` for details.

## About QuantumQuest
QuantumQuest is a team of developers creating an innovative automation framework. Focus Bubble, an open-source Chrome extension, enhances LeetCode progress tracking and serves as a foundation for future productivity tools. By releasing Focus Bubble as open-source, QuantumQuest aims to foster collaboration and deliver value to the developer community ahead of the automation framework’s launch.
