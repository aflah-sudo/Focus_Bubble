importScripts('Firebase-App.js', 'Firebase-Auth.js', 'Firebase-Database.js');

const firebaseConfig = {
  apiKey: "AIzaSyDiQlUBcFWGP6uW1P11gDbV2gCZ0GT5N8A",
  authDomain: "focus-bubble-quantum-labs.firebaseapp.com",
  databaseURL: "https://focus-bubble-quantum-labs-default-rtdb.firebaseio.com",
  projectId: "focus-bubble-quantum-labs",
  storageBucket: "focus-bubble-quantum-labs.firebasestorage.app",
  messagingSenderId: "293759421749",
  appId: "1:293759421749:web:1e33e2a6275b56d6cd507c",
  measurementId: "G-KSFCG2RFSL"
};

let firebase_initialized = false;

function init_firebase() {
  if (!firebase_initialized) {
    try {
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase scripts not loaded');
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase initialized in background");
      }
      firebase_initialized = true;
    } catch (error) {
      console.error("Firebase initialization failed in background:", error);
    }
  }
}

// Initialize Firebase on load
init_firebase();

let active_tabs = new Map();
let sync_queue = [];
let user_config = {
  username: "default_user",
  firebase_db_url: firebaseConfig.databaseURL,
  firebase_root: "leaderboard",
  firebase_auth_token: "",
  daily_penalty: -150,
  bonus_under_secs: 900,
  auto_sync: false
};

let extension_status = {
  last_sync: null,
  sync_error: null,
  pending_syncs: 0,
  auth_status: "not_authenticated"
};

console.log("🚀 LeetCode Tracker background script loaded");

// Initialize extension
chrome.runtime.onStartup.addListener(() => {
  console.log("🔄 Extension startup - checking configuration");
  loadConfig();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("📦 Extension installed/updated");
  loadConfig();
  schedule_daily_penalty();
});

// Load configuration and check auth status
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user_config", "sync_queue"], (result) => {
      if (result.user_config) {
        user_config = { ...user_config, ...result.user_config };
        extension_status.auth_status = user_config.firebase_auth_token ? "authenticated" : "not_authenticated";
        console.log("⚙️ Config loaded - User:", user_config.username, "Auth:", extension_status.auth_status);
      }
      
      if (result.sync_queue) {
        sync_queue = result.sync_queue;
        extension_status.pending_syncs = sync_queue.length;
        console.log("📋 Sync queue loaded - Pending:", extension_status.pending_syncs);
      }
      
      resolve();
    });
  });
}

// Enhanced message handler
chrome.runtime.onMessage.addListener((msg, sender, send_response) => {
  console.log("📨 Received message:", msg.type, sender.tab?.url);
  
  switch (msg.type) {
    case "start_timer":
      start_timer_handler(sender.tab.id, send_response);
      break;
      
    case "stop_timer":
      stop_timer_handler(sender.tab.id, send_response);
      break;
      
    case "solve_accepted":
      handle_solve_accepted(msg.data, sender.tab.id, send_response);
      return true; // Async response
      
    case "get_stats":
      send_stats(send_response);
      return true; // Async response
      
    case "get_status":
      send_response(extension_status);
      break;
      
    case "manual_sync":
      manual_sync_handler(send_response);
      return true; // Async response
      
    case "clear_sync_queue":
      clear_sync_queue_handler(send_response);
      break;
      
    case "update_auth":
      update_auth_handler(msg.config, send_response);
      break;
      
    case "test_connection":
      test_connection_handler(send_response);
      return true; // Async response
      
    default:
      console.log("❓ Unknown message type:", msg.type);
      send_response({ status: "unknown_type" });
  }
});

// Timer handlers
function start_timer_handler(tab_id, send_response) {
  active_tabs.set(tab_id, {
    start_time: Date.now(),
    url: null // Will be set when solve is accepted
  });
  console.log("⏱️ Timer started for tab:", tab_id);
  send_response({ status: "timer_started", start_time: Date.now() });
}

function stop_timer_handler(tab_id, send_response) {
  if (active_tabs.has(tab_id)) {
    active_tabs.delete(tab_id);
    console.log("⏹️ Timer stopped for tab:", tab_id);
    send_response({ status: "timer_stopped" });
  } else {
    send_response({ status: "no_timer" });
  }
}

// Enhanced solve handler
function handle_solve_accepted(data, tab_id, send_response) {
  console.log("🎉 Solve accepted:", data.title, "Difficulty:", data.difficulty);
  
  chrome.storage.local.get(["solved_titles"], (result) => {
    let solved_titles = result.solved_titles || [];
    
    // Check for duplicate
    if (solved_titles.includes(data.title)) {
      active_tabs.delete(tab_id);
      console.log("🔄 Duplicate solve detected:", data.title);
      send_response({ status: "duplicate_detected", title: data.title });
      return;
    }

    // Calculate score
    let score = calculate_score(data.difficulty, data.time_taken_sec);
    let solve_entry = create_solve_entry(data, score);
    
    console.log("💯 Score calculated:", score, "Time:", data.time_taken_sec + "s");

    // Save to local storage
    chrome.storage.local.get(["solves", "total_score"], (result2) => {
      let solves = result2.solves || [];
      let total_score = result2.total_score || 0;
      
      solves.push(solve_entry);
      total_score += score;
      solved_titles.push(data.title);

      chrome.storage.local.set({ solves, total_score, solved_titles }, () => {
        console.log("💾 Solve saved locally - New total:", total_score);
        
        // Add to sync queue instead of auto-sync
        if (user_config.firebase_db_url && user_config.firebase_auth_token) {
          add_to_sync_queue(solve_entry, total_score, solved_titles);
          
          // Auto-sync only if enabled
          if (user_config.auto_sync) {
            console.log("🔄 Auto-sync enabled, syncing now...");
            process_sync_queue();
          } else {
            console.log("📋 Added to sync queue - Manual sync required");
          }
        }
        
        send_response({ 
          status: "solve_processed", 
          score: score,
          total_score: total_score,
          sync_queued: !user_config.auto_sync
        });
      });
    });

    active_tabs.delete(tab_id);
  });
}

// Create solve entry
function create_solve_entry(data, score) {
  return {
    title: data.title,
    slug: data.slug,
    url: data.url,
    difficulty: data.difficulty,
    time_taken_sec: data.time_taken_sec,
    timestamp: Date.now(),
    date_iso: new Date().toISOString(),
    score: score,
    synced: false
  };
}

// Enhanced score calculation
function calculate_score(difficulty, time_taken_sec) {
  let base_scores = { 
    "Easy": 50, 
    "Medium": 100, 
    "Hard": 200 
  };
  
  let base = base_scores[difficulty] || base_scores["Medium"];
  let bonus = time_taken_sec < user_config.bonus_under_secs ? 20 : 0;
  let speed_penalty = time_taken_sec > 3600 ? -10 : 0; // 1 hour penalty
  
  return Math.max(base + bonus + speed_penalty, 10); // Minimum 10 points
}

// Sync queue management
function add_to_sync_queue(solve_entry, total_score, solved_titles) {
  sync_queue.push({
    id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    solve_entry,
    total_score,
    solved_titles,
    attempts: 0,
    created_at: Date.now()
  });
  
  extension_status.pending_syncs = sync_queue.length;
  
  // Save queue to storage
  chrome.storage.local.set({ sync_queue });
  console.log("📋 Added to sync queue - Total pending:", sync_queue.length);
}

// Manual sync handler
async function manual_sync_handler(send_response) {
  console.log("🔄 Manual sync requested - Queue length:", sync_queue.length);
  
  if (sync_queue.length === 0) {
    send_response({ status: "nothing_to_sync", message: "No pending syncs" });
    return;
  }
  
  const result = await process_sync_queue();
  send_response(result);
}

// Process sync queue
async function process_sync_queue() {
  init_firebase(); // Ensure Firebase is initialized
  if (sync_queue.length === 0) {
    return { status: "queue_empty", synced: 0, failed: 0 };
  }
  
  console.log("🔄 Processing sync queue - Items:", sync_queue.length);
  extension_status.sync_error = null;
  
  let synced_count = 0;
  let failed_count = 0;
  let auth_failed = false;
  
  // Get fresh token
  const token = await getFreshToken();
  if (!token) {
    extension_status.sync_error = "No authentication token";
    extension_status.auth_status = "not_authenticated";
    console.log("❌ Sync failed - No authentication token");
    return { status: "auth_required", synced: 0, failed: sync_queue.length };
  }
  
  // Process each item in queue
  for (let i = sync_queue.length - 1; i >= 0; i--) {
    let queue_item = sync_queue[i];
    queue_item.attempts++;
    
    try {
      await sync_single_item(queue_item, token);
      sync_queue.splice(i, 1); // Remove successful item
      synced_count++;
      console.log("✅ Synced:", queue_item.solve_entry.title);
    } catch (error) {
      failed_count++;
      console.log("❌ Sync failed:", queue_item.solve_entry.title, error.message);
      
      if (error.message.includes("401") || error.message.includes("403")) {
        auth_failed = true;
        extension_status.auth_status = "token_expired";
        break; // Stop processing on auth failure
      }
      
      // Remove items that have failed too many times
      if (queue_item.attempts >= 3) {
        console.log("🗑️ Removing failed item after 3 attempts:", queue_item.solve_entry.title);
        sync_queue.splice(i, 1);
      }
    }
  }
  
  // Update status
  extension_status.pending_syncs = sync_queue.length;
  extension_status.last_sync = synced_count > 0 ? new Date().toLocaleTimeString() : null;
  
  if (auth_failed) {
    clearInvalidToken();
    extension_status.sync_error = "Authentication expired - please sign in again";
  } else if (failed_count > 0) {
    extension_status.sync_error = `${failed_count} items failed to sync`;
  } else {
    extension_status.sync_error = null;
  }
  
  // Save updated queue
  chrome.storage.local.set({ sync_queue });
  
  console.log("📊 Sync complete - Synced:", synced_count, "Failed:", failed_count, "Remaining:", sync_queue.length);
  
  return {
    status: auth_failed ? "auth_failed" : "completed",
    synced: synced_count,
    failed: failed_count,
    remaining: sync_queue.length
  };
}

// Sync single item to Firebase
async function sync_single_item(queue_item, token) {
  const { solve_entry, total_score, solved_titles } = queue_item;
  const date = solve_entry.date_iso.split("T")[0];
  const baseUrl = `${user_config.firebase_db_url}/${user_config.firebase_root}/${user_config.username}`;
  const authQ = `?auth=${token}`;

  // Helper functions
  async function patch(url, body) {
    let res = await fetch(url + authQ, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  async function put(url, body) {
    let res = await fetch(url + authQ, {
      method: "PUT", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  // Sync data
  await patch(`${baseUrl}.json`, {
    total_score,
    last_solve: solve_entry.date_iso,
    last_sync: new Date().toISOString()
  });
  
  await patch(`${baseUrl}/solves/${date}.json`, {
    [solve_entry.slug]: solve_entry
  });
  
  await put(`${baseUrl}/solved_titles.json`, solved_titles);
}

// Get token from storage
async function getFreshToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["firebase_token", "auth_status"], (res) => {
      if (!res.firebase_token || res.auth_status !== "authenticated") {
        console.log("No valid token in storage");
        resolve(null);
      } else {
        // Ensure Firebase is initialized
        init_firebase();
        if (firebase_initialized && firebase.auth().currentUser) {
          firebase.auth().currentUser.getIdToken(true).then(token => {
            chrome.storage.local.set({ firebase_token: token }, () => {
              console.log("Token refreshed in getFreshToken");
              resolve(token);
            });
          }).catch(error => {
            console.error("Token refresh failed:", error.message || error);
            chrome.storage.local.set({ auth_status: "token_expired", firebase_token: null });
            resolve(res.firebase_token); // Fallback to stored token
          });
        } else {
          console.log("No current user, using stored token");
          resolve(res.firebase_token);
        }
      }
    });
  });
}
// Clear invalid token
function clearInvalidToken() {
  chrome.storage.local.get(["user_config"], (result) => {
    let config = result.user_config || {};
    delete config.firebase_auth_token;
    chrome.storage.local.set({ user_config: config });
    user_config.firebase_auth_token = "";
    extension_status.auth_status = "not_authenticated";
    console.log("🔑 Cleared invalid token");
  });
}

// Update auth handler
function update_auth_handler(config, send_response) {
  user_config = { ...user_config, ...config };
  chrome.storage.local.set({ user_config: config });
  extension_status.auth_status = config.firebase_auth_token ? "authenticated" : "not_authenticated";
  console.log("🔑 Auth updated - Status:", extension_status.auth_status);
  send_response({ status: "auth_updated" });
}

// Clear sync queue
function clear_sync_queue_handler(send_response) {
  sync_queue = [];
  extension_status.pending_syncs = 0;
  chrome.storage.local.set({ sync_queue: [] });
  console.log("🗑️ Sync queue cleared");
  send_response({ status: "queue_cleared" });
}

// Test connection
async function test_connection_handler(send_response) {
  init_firebase(); // Ensure Firebase is initialized
  const token = await getFreshToken();
  if (!token) {
    send_response({ status: "no_auth", message: "No authentication token" });
    return;
  }
  
  try {
    console.log("🔍 Testing Firebase connection...");
    let response = await fetch(`${user_config.firebase_db_url}/.json?auth=${token}`);
    if (response.ok) {
      console.log("✅ Firebase connection successful");
      send_response({ status: "connection_ok", message: "Firebase connection successful" });
    } else {
      console.log("❌ Firebase connection failed:", response.status);
      send_response({ status: "connection_failed", message: `HTTP ${response.status}` });
    }
  } catch (error) {
    console.log("❌ Firebase connection error:", error.message);
    send_response({ status: "connection_error", message: error.message });
  }
}

// Enhanced stats sender
async function send_stats(send_response) {
  console.log("📊 Preparing stats for popup");

  // --- Local stats ---
  let local_stats = await new Promise((resolve) => {
    chrome.storage.local.get(["solves", "total_score", "user_config", "username"], (result) => {
      let solves = result.solves || [];
      resolve({
        solves: solves,
        total_score: result.total_score || 0,
        username: result.username || result.user_config?.username || user_config.username,
        last_solve: solves.slice(-1)[0]?.date_iso || "Never",
        solve_count: solves.length,
        active_timer: active_tabs.size > 0 
          ? Math.round((Date.now() - Array.from(active_tabs.values())[0].start_time) / 1000)
          : 0
      });
    });
  });

  // --- Default leaderboard and stats ---
  let leaderboard = { [local_stats.username]: local_stats };
  let leaderboard_error = null;
  let firebase_stats = null;

  const token = await getFreshToken();
  if (user_config.firebase_db_url && token && extension_status.auth_status === "authenticated") {
    try {
      console.log("📡 Fetching leaderboard and user stats...");

      // Fetch leaderboard (UID keyed)
      let lb_res = await fetch(`${user_config.firebase_db_url}/leaderboard.json?auth=${token}`);
      if (lb_res.ok) {
        let leaderboard_raw = await lb_res.json() || {};

        // Get cached users_map
        let { users_cache } = await new Promise((resolve) => chrome.storage.local.get(["users_cache"], resolve));
        let now = Date.now();
        let users_map = users_cache?.map || {};
        let cache_expired = !users_cache || (now - users_cache.timestamp > 5 * 60 * 1000); // 5 min expiry

        // Refresh users_map if expired
        if (cache_expired) {
          console.log("🔄 Refreshing users cache...");
          let users_res = await fetch(`${user_config.firebase_db_url}/users.json?auth=${token}`);
          if (users_res.ok) {
            let users_raw = await users_res.json() || {};
            users_map = {};
            for (let uid in users_raw) {
              users_map[uid] = users_raw[uid]?.username || uid;
            }
            chrome.storage.local.set({ users_cache: { map: users_map, timestamp: now } });
            console.log("✅ Users cache updated:", Object.keys(users_map).length, "users");
          } else {
            console.log("⚠️ Failed to refresh users cache, keeping old");
          }
        } else {
          console.log("🗂 Using cached users:", Object.keys(users_map).length);
        }

        // Remap leaderboard UID → username
        let remapped = {};
        for (let uid in leaderboard_raw) {
          let uname = users_map[uid] || uid;
          remapped[uname] = leaderboard_raw[uid];
        }
        leaderboard = remapped;

        // Fetch user stats from Firebase
        let user_res = await fetch(`${user_config.firebase_db_url}/leaderboard/${user_config.username}.json?auth=${token}`);
        if (user_res.ok) {
          let user_data = await user_res.json();
          if (user_data) {
            firebase_stats = {
              solves: Object.values(user_data.solves || {}).flatMap(s => Object.values(s)),
              total_score: user_data.total_score || 0,
              username: user_config.username,
              last_solve: user_data.last_solve || "Never",
              solve_count: Object.values(user_data.solves || {}).flatMap(s => Object.values(s)).length
            };
            // Update local storage with Firebase data
            chrome.storage.local.set({
              solves: firebase_stats.solves,
              total_score: firebase_stats.total_score,
              solved_titles: user_data.solved_titles || []
            }, () => {
              console.log("✅ Synced local storage with Firebase stats:", firebase_stats.total_score, "points,", firebase_stats.solve_count, "solves");
            });
          }
        }
      } else if (lb_res.status === 401 || lb_res.status === 403) {
        console.log("🔑 Token expired while fetching leaderboard");
        clearInvalidToken();
        leaderboard_error = "Authentication expired";
        extension_status.auth_status = "token_expired";
      } else {
        leaderboard_error = `HTTP ${lb_res.status}`;
      }
    } catch (e) {
      console.log("❌ Leaderboard/user stats fetch error:", e.message);
      leaderboard_error = e.message;
    }
  }

  // Use Firebase stats if available, otherwise fall back to local
  let stats_to_send = firebase_stats || local_stats;

  send_response({
    local_stats: stats_to_send,
    leaderboard,
    extension_status,
    leaderboard_error,
    config: {
      auto_sync: user_config.auto_sync,
      username: user_config.username,
      authenticated: !!user_config.firebase_auth_token
    }
  });
}


// Daily penalty system
function schedule_daily_penalty() {
  let now = new Date();
  let next_penalty = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0));
  if (now > next_penalty) next_penalty.setUTCDate(next_penalty.getUTCDate() + 1);

  chrome.alarms.create("daily_penalty", {
    when: next_penalty.getTime(),
    periodInMinutes: 24 * 60
  });
  
  console.log("⏰ Daily penalty scheduled for:", next_penalty.toLocaleString());
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily_penalty") {
    console.log("⚠️ Applying daily penalty...");
    apply_daily_penalty();
  }
});

async function apply_daily_penalty() {
  let today = new Date().toISOString().split("T")[0];
  chrome.storage.local.get(["solves", "total_score"], async (result) => {
    let solves = result.solves || [];
    let has_solve_today = solves.some(s => s.date_iso.startsWith(today));
    
    if (!has_solve_today) {
      let total_score = (result.total_score || 0) + user_config.daily_penalty;
      chrome.storage.local.set({ total_score }, () => {
        console.log("💸 Daily penalty applied:", user_config.daily_penalty, "New total:", total_score);
        
        // Add penalty to sync queue
        if (user_config.firebase_db_url && user_config.firebase_auth_token) {
          let penalty_entry = {
            type: "penalty",
            amount: user_config.daily_penalty,
            date: today,
            timestamp: Date.now()
          };
          
          add_to_sync_queue(penalty_entry, total_score, []);
        }
      });
    } else {
      console.log("✅ Daily solve found - No penalty applied");
    }
  });
}

// Watch for config changes
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.user_config) {
    let old_username = user_config.username;
    user_config = { ...user_config, ...changes.user_config.newValue };
    
    if (old_username !== user_config.username) {
      console.log("👤 Username changed:", old_username, "->", user_config.username);
    }
    
    extension_status.auth_status = user_config.firebase_auth_token ? "authenticated" : "not_authenticated";
  }
});

// Tab cleanup
chrome.tabs.onRemoved.addListener((tab_id) => {
  if (active_tabs.has(tab_id)) {
    console.log("🧹 Cleaning up timer for closed tab:", tab_id);
    active_tabs.delete(tab_id);
  }
});

// Initialize
loadConfig();

// Periodic token refresh
setInterval(() => {
  if (firebase_initialized && firebase.auth().currentUser) {
    firebase.auth().currentUser.getIdToken(true).then(token => {
      chrome.storage.local.set({ firebase_token: token }, () => {
        console.log("Token refreshed in background");
      });
    }).catch(error => {
      console.error("Token refresh failed:", error);
      chrome.storage.local.set({ auth_status: "token_expired", firebase_token: null });
    });
  }
}, 30 * 60 * 1000); // Every 30 minutes