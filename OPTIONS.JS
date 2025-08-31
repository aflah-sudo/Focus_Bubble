let firebase_initialized = false;

document.addEventListener("DOMContentLoaded", () => {
  console.log("Options page loaded");
  init_firebase();
  load_settings();
  setup_event_listeners();
  update_debug_info();
  setInterval(update_debug_info, 3000);
});

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

function init_firebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully");
    }
    firebase_initialized = true;
    
    // Setup auth state listener
    firebase.auth().onAuthStateChanged(handle_auth_state_change);
    
    // Setup token refresh
    firebase.auth().onIdTokenChanged(handle_token_change);
    
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    show_status("Firebase initialization failed: " + error.message, "error");
  }
}

function handle_auth_state_change(user) {
  if (user) {
    firebase.auth().currentUser.getIdToken(true).then(token => {
      chrome.storage.local.set({
        firebase_token: token,
        firebase_uid: user.uid,
        username: user.email.split('@')[0] || 'User', // Use email prefix as username
        auth_status: 'authenticated'
      }, () => {
        console.log("Auth state saved:", user.email);
        show_status("Signed in as " + user.email, "success");
      });
    });
  } else {
    chrome.storage.local.set({
      firebase_token: null,
      firebase_uid: null,
      username: null,
      auth_status: 'not_authenticated'
    }, () => {
      console.log("User signed out");
      show_status("Signed out", "info");
    });
  }
}

function handle_token_change(user) {
  if (user) {
    user.getIdToken(true).then(token => {
      console.log("Token refreshed automatically");
      save_auth_config(user, token);
    }).catch(error => {
      console.error("Token refresh failed:", error);
      show_status("Token refresh failed: " + error.message, "error");
    });
  }
}

function save_auth_config(user, token) {
  chrome.storage.local.get(["user_config"], (result) => {
    let config = result.user_config || {};
    config.username = user.uid;
    config.firebase_auth_token = token;
    config.firebase_db_url = firebaseConfig.databaseURL;
    
    chrome.storage.local.set({ user_config: config }, () => {
      console.log("Auth config saved for user:", user.uid);
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: "update_auth",
        config: config
      }, (response) => {
        if (response && response.status === "auth_updated") {
          console.log("Background script notified of auth update");
        }
      });
    });
  });
}

function pull_server_data(user, token) {
  console.log("Pulling server data for user:", user.uid);
  
  fetch(`${firebaseConfig.databaseURL}/leaderboard/${user.uid}.json?auth=${token}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (data && data.solves) {
        // Merge server data with local data
        merge_server_data(data);
        show_status("Data synchronized from server", "success");
      } else {
        console.log("No server data found - using local data");
      }
    })
    .catch(error => {
      console.error("Failed to pull server data:", error);
      show_status("Failed to sync from server: " + error.message, "error");
    });
}

function merge_server_data(server_data) {
  chrome.storage.local.get(["solves", "total_score", "solved_titles"], (local) => {
    let local_solves = local.solves || [];
    let server_solves = Object.values(server_data.solves || {}).flatMap(d => Object.values(d));
    
    // Create map of existing local solves by slug
    let local_map = new Map(local_solves.map(s => [s.slug, s]));
    
    // Add server solves that aren't in local storage
    let added_count = 0;
    server_solves.forEach(server_solve => {
      if (!local_map.has(server_solve.slug)) {
        local_solves.push(server_solve);
        added_count++;
      }
    });
    
    // Update storage with merged data
    chrome.storage.local.set({
      solves: local_solves,
      total_score: Math.max(local.total_score || 0, server_data.total_score || 0),
      solved_titles: Array.from(new Set([...(local.solved_titles || []), ...(server_data.solved_titles || [])]))
    }, () => {
      console.log(`Merged ${added_count} solves from server`);
    });
  });
}

function load_settings() {
  chrome.storage.local.get(["user_config"], (result) => {
    let config = result.user_config || {};
    
    document.getElementById("firebase_root").value = config.firebase_root || "leaderboard";
    document.getElementById("daily_penalty").value = config.daily_penalty || -150;
    document.getElementById("bonus_under_secs").value = config.bonus_under_secs || 900;
    document.getElementById("auto_sync").checked = config.auto_sync || false;
    
    console.log("Settings loaded:", config);
  });
}

function setup_event_listeners() {
  // Save settings
  document.getElementById("save_settings").addEventListener("click", save_settings);
  
  // Auth buttons
  document.getElementById("sign_up").addEventListener("click", handle_sign_up);
  document.getElementById("sign_in").addEventListener("click", handle_sign_in);
  document.getElementById("sign_out").addEventListener("click", handle_sign_out);
  document.getElementById("refresh_token").addEventListener("click", handle_refresh_token);
  
  // Utility buttons
  document.getElementById("test_connection").addEventListener("click", test_firebase_connection);
  document.getElementById("export_data").addEventListener("click", export_local_data);
  document.getElementById("import_data").addEventListener("click", import_data);
  document.getElementById("clear_all_data").addEventListener("click", clear_all_data);
}

function save_settings() {
  let config = {
    firebase_db_url: firebaseConfig.databaseURL,
    firebase_root: document.getElementById("firebase_root").value || "leaderboard",
    daily_penalty: parseInt(document.getElementById("daily_penalty").value) || -150,
    bonus_under_secs: parseInt(document.getElementById("bonus_under_secs").value) || 900,
    auto_sync: document.getElementById("auto_sync").checked
  };
  
  chrome.storage.local.get(["user_config"], (result) => {
    let existing_config = result.user_config || {};
    let merged_config = { ...existing_config, ...config };
    
    chrome.storage.local.set({ user_config: merged_config }, () => {
      console.log("Settings saved:", merged_config);
      show_status("Settings saved successfully", "success");
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: "update_auth", 
        config: merged_config
      });
    });
  });
}

// In options.js, update sign-up and sign-in handlers
// In options.js, replace handle_sign_up and handle_sign_in
async function handle_sign_up() {
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;
  try {
    let userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    let user = userCredential.user;
    let token = await user.getIdToken();
    let username = email.split('@')[0] || 'User';
    await firebase.database().ref(`users/${user.uid}`).set({ username, email });
    chrome.storage.local.set({
      user_config: {
        username: username,
        firebase_db_url: firebaseConfig.databaseURL,
        firebase_root: "leaderboard",
        firebase_auth_token: token,
        daily_penalty: -150,
        bonus_under_secs: 900,
        auto_sync: false
      },
      firebase_token: token,
      firebase_uid: user.uid,
      username: username,
      auth_status: 'authenticated'
    }, () => {
      show_status("Signed up successfully", "success");
      chrome.runtime.sendMessage({ type: "update_auth", config: { firebase_auth_token: token, username } });
    });
  } catch (error) {
    show_status("Sign-up failed: " + error.message, "error");
  }
}

async function handle_sign_in() {
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;
  try {
    let userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    let user = userCredential.user;
    let token = await user.getIdToken();
    let username = email.split('@')[0] || 'User';
    await firebase.database().ref(`users/${user.uid}`).set({ username, email });
    chrome.storage.local.set({
      user_config: {
        username: username,
        firebase_db_url: firebaseConfig.databaseURL,
        firebase_root: "leaderboard",
        firebase_auth_token: token,
        daily_penalty: -150,
        bonus_under_secs: 900,
        auto_sync: false
      },
      firebase_token: token,
      firebase_uid: user.uid,
      username: username,
      auth_status: 'authenticated'
    }, () => {
      show_status("Signed in successfully", "success");
      chrome.runtime.sendMessage({ type: "update_auth", config: { firebase_auth_token: token, username } });
    });
  } catch (error) {
    show_status("Sign-in failed: " + error.message, "error");
  }
}
function handle_sign_out() {
  if (!firebase_initialized) {
    show_status("Firebase not initialized", "error");
    return;
  }
  
  firebase.auth().signOut()
    .then(() => {
      console.log("Sign-out successful");
      
      // Clear auth from storage
      chrome.storage.local.get(["user_config"], (result) => {
        let config = result.user_config || {};
        delete config.username;
        delete config.firebase_auth_token;
        
        chrome.storage.local.set({ user_config: config }, () => {
          show_status("Signed out successfully", "success");
          
          // Notify background script
          chrome.runtime.sendMessage({
            type: "update_auth",
            config: config
          });
        });
      });
    })
    .catch(error => {
      console.error("Sign-out failed:", error);
      show_status("Sign-out failed: " + error.message, "error");
    });
}

function handle_refresh_token() {
  if (!firebase_initialized) {
    show_status("Firebase not initialized", "error");
    return;
  }
  
  const user = firebase.auth().currentUser;
  if (!user) {
    show_status("No user signed in", "error");
    return;
  }
  
  show_status("Refreshing token...", "info");
  
  user.getIdToken(true)
    .then(token => {
      save_auth_config(user, token);
      show_status("Token refreshed successfully", "success");
    })
    .catch(error => {
      console.error("Token refresh failed:", error);
      show_status("Token refresh failed: " + error.message, "error");
    });
}

function test_firebase_connection() {
  chrome.runtime.sendMessage({ type: "test_connection" }, (response) => {
    if (response) {
      show_status(response.message, 
                 response.status === "connection_ok" ? "success" : "error");
    } else {
      show_status("Connection test failed - no response", "error");
    }
  });
}

function export_local_data() {
  chrome.storage.local.get(null, (data) => {
    let export_data = {
      exported_at: new Date().toISOString(),
      version: "2.0",
      data: data
    };
    
    let blob = new Blob([JSON.stringify(export_data, null, 2)], { type: "application/json" });
    let url = URL.createObjectURL(blob);
    
    let a = document.createElement("a");
    a.href = url;
    a.download = `leetcode-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    show_status("Data exported successfully", "success");
  });
}

function import_data() {
  let input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  
  input.onchange = (e) => {
    let file = e.target.files[0];
    if (!file) return;
    
    let reader = new FileReader();
    reader.onload = (e) => {
      try {
        let imported = JSON.parse(e.target.result);
        
        if (!imported.data) {
          throw new Error("Invalid backup file format");
        }
        
        // Merge with existing data
        chrome.storage.local.get(null, (existing) => {
          let merged = {
            ...existing,
            solves: [...(existing.solves || []), ...(imported.data.solves || [])],
            total_score: Math.max(existing.total_score || 0, imported.data.total_score || 0),
            solved_titles: Array.from(new Set([
              ...(existing.solved_titles || []), 
              ...(imported.data.solved_titles || [])
            ]))
          };
          
          chrome.storage.local.set(merged, () => {
            show_status("Data imported and merged successfully", "success");
            console.log("Data import completed");
          });
        });
      } catch (error) {
        show_status("Import failed: " + error.message, "error");
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

function clear_all_data() {
  if (!confirm("Are you sure? This will delete ALL local data including solves, scores, and settings. This cannot be undone.")) {
    return;
  }
  
  chrome.storage.local.clear(() => {
    show_status("All data cleared", "success");
    console.log("All local data cleared");
    
    // Reset form
    load_settings();
    
    // Sign out from Firebase
    if (firebase_initialized && firebase.auth().currentUser) {
      firebase.auth().signOut();
    }
  });
}

function update_debug_info() {
  chrome.storage.local.get(null, (data) => {
    document.getElementById("ext_status").textContent = 
      chrome.runtime.id ? "Running" : "Error";
    
    let config_status = "Not configured";
    if (data.user_config) {
      if (data.user_config.username && data.user_config.firebase_auth_token) {
        config_status = "Fully configured";
      } else if (data.user_config.username) {
        config_status = "User set, no auth";
      } else {
        config_status = "Partially configured";
      }
    }
    document.getElementById("config_status").textContent = config_status;
    
    let last_activity = "N/A";
    if (data.solves && data.solves.length > 0) {
      let last_solve = data.solves.slice(-1)[0];
      last_activity = new Date(last_solve.timestamp).toLocaleString();
    }
    document.getElementById("last_activity").textContent = last_activity;
  });
}

function show_status(message, type) {
  let status_el = document.getElementById("auth_status_display");
  status_el.textContent = message;
  status_el.className = `status status-${type}`;
  
  console.log(`Status (${type}):`, message);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "refresh_token_request") {
    console.log("Token refresh requested from background script");
    handle_refresh_token();
    sendResponse({ status: "refresh_initiated" });
  }
});

// Auto-save settings when they change
document.addEventListener("change", (e) => {
  if (["firebase_root", "daily_penalty", "bonus_under_secs", "auto_sync"].includes(e.target.id)) {
    setTimeout(save_settings, 500); // Debounced auto-save
  }
});