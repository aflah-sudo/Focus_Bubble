document.addEventListener("DOMContentLoaded", () => {
  load_stats();
  setup_controls();
});

function setup_controls() {
  document.getElementById("manual_sync_btn").addEventListener("click", () => {
    manual_sync();
  });
  
  document.getElementById("test_connection_btn").addEventListener("click", () => {
    test_connection();
  });
  
  document.getElementById("clear_queue_btn").addEventListener("click", () => {
    if (confirm("Clear all pending syncs? This cannot be undone.")) {
      clear_sync_queue();
    }
  });
}

function manual_sync() {
  let btn = document.getElementById("manual_sync_btn");
  btn.disabled = true;
  btn.textContent = "Syncing...";
  
  chrome.runtime.sendMessage({ type: "manual_sync" }, (response) => {
    btn.disabled = false;
    btn.textContent = "Sync Now";
    
    if (chrome.runtime.lastError) {
      console.error("Sync error:", chrome.runtime.lastError.message);
      update_sync_status("Sync failed: " + chrome.runtime.lastError.message, "error");
      return;
    }
    
    if (response) {
      update_sync_status(
        response.status === "completed" ? `Synced ${response.synced}, Failed ${response.failed}` : response.message,
        response.status === "completed" ? "success" : "error"
      );
    } else {
      update_sync_status("Sync failed - no response", "error");
    }
    
    load_stats(); // Refresh stats immediately
  });
}

function test_connection() {
  let btn = document.getElementById("test_connection_btn");
  btn.disabled = true;
  btn.textContent = "Testing...";
  
  chrome.runtime.sendMessage({ type: "test_connection" }, (response) => {
    btn.disabled = false;
    btn.textContent = "Test Connection";
    
    if (chrome.runtime.lastError) {
      console.error("Test connection error:", chrome.runtime.lastError.message);
      update_sync_status("Test failed: " + chrome.runtime.lastError.message, "error");
      return;
    }
    
    if (response) {
      update_sync_status(
        response.message,
        response.status === "connection_ok" ? "success" : "error"
      );
    } else {
      update_sync_status("Test failed - no response", "error");
    }
  });
}

function clear_sync_queue() {
  chrome.runtime.sendMessage({ type: "clear_sync_queue" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Clear queue error:", chrome.runtime.lastError.message);
      update_sync_status("Clear queue failed: " + chrome.runtime.lastError.message, "error");
      return;
    }
    
    if (response && response.status === "queue_cleared") {
      update_sync_status("Sync queue cleared", "info");
      load_stats();
    }
  });
}

function update_sync_status(message, type) {
  let status_el = document.getElementById("sync_status");
  status_el.textContent = message;
  status_el.className = `status-${type}`;
}

function load_stats() {
  chrome.runtime.sendMessage({ type: "get_stats" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Stats error:", chrome.runtime.lastError.message);
      update_sync_status("Failed to load stats: " + chrome.runtime.lastError.message, "error");
      return;
    }

    if (!response) {
      console.error("No response from background script");
      update_sync_status("Failed to load stats", "error");
      return;
    }

    let { local_stats, leaderboard, extension_status, leaderboard_error, config } = response;

    // Update basic stats
    document.getElementById("username").textContent = local_stats.username || "Guest";
    document.getElementById("total_score").textContent = local_stats.total_score || 0;
    document.getElementById("solve_count").textContent = local_stats.solve_count || 0;
    document.getElementById("active_timer").textContent = 
      local_stats.active_timer ? `${local_stats.active_timer}s` : "Not running";

    // Update auth status
    let auth_el = document.getElementById("auth_status");
    if (config.authenticated) {
      auth_el.textContent = " Authenticated";
      auth_el.className = "status-success";
    } else {
      auth_el.innerHTML = ' Not authenticated - <a href="options.html" target="_blank">Sign In</a>';
      auth_el.className = "status-error";
    }

    // Update sync info
    document.getElementById("pending_count").textContent = extension_status.pending_syncs || 0;
    document.getElementById("auto_sync_status").textContent = config.auto_sync ? "Enabled" : "Manual";

    // Update sync status
    let sync_status_text = "Ready";
    let sync_status_type = "info";
    if (extension_status.sync_error) {
      sync_status_text = extension_status.sync_error;
      sync_status_type = "error";
    } else if (extension_status.last_sync) {
      sync_status_text = `Last sync: ${extension_status.last_sync}`;
      sync_status_type = "success";
    }
    update_sync_status(sync_status_text, sync_status_type);

    // Update recent solves
    update_solves_table(local_stats.solves || []);

    // Update leaderboard
    update_leaderboard_table(leaderboard || {}, local_stats.username, leaderboard_error);
  });
}

// Listen for storage changes to update auth state
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.firebase_token || changes.auth_status || changes.username || changes.total_score || changes.recent_solves || changes.sync_queue)) {
    console.log("🔄 Storage changed, updating popup");
    load_stats();
  }
});

function update_solves_table(solves) {
  let tbody = document.querySelector("#solves_table tbody");
  tbody.innerHTML = "";
  
  let recent_solves = solves.slice(-10).reverse(); // Last 10, most recent first
  
  if (recent_solves.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No solves yet</td></tr>';
    return;
  }
  
  recent_solves.forEach(solve => {
    let row = document.createElement("tr");
    let sync_status = solve.synced ? 
      '<span class="sync-status sync-synced">✓</span>' : 
      '<span class="sync-status sync-pending">wait..</span>';
    
    row.innerHTML = `
      <td><a href="${solve.url}" target="_blank" title="${solve.title}">${truncate(solve.title, 20)}</a></td>
      <td>${solve.difficulty[0]}</td>
      <td>${solve.time_taken_sec}s</td>
      <td>${solve.score}</td>
      <td>${sync_status}</td>
    `;
    tbody.appendChild(row);
  });
}

function update_leaderboard_table(leaderboard, current_user, error) {
  let error_el = document.getElementById("leaderboard_error");
  let tbody = document.querySelector("#leaderboard_table tbody");
  
  if (error) {
    error_el.textContent = `error ${error}`;
    error_el.style.display = "block";
  } else {
    error_el.style.display = "none";
  }
  
  tbody.innerHTML = "";
  
  let users = Object.entries(leaderboard || {})
    .map(([username, data]) => ({
      username,
      total_score: data.total_score || 0,
      solve_count: data.solve_count || (data.solves ? Object.keys(data.solves).length : 0),
      last_solve: data.last_solve || "Never"
    }))
    .sort((a, b) => b.total_score - a.total_score);
  
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No leaderboard data</td></tr>';
    return;
  }
  
  users.slice(0, 10).forEach((user, index) => {
    let row = document.createElement("tr");
    if (user.username === current_user) {
      row.className = "user-row";
    }
    
    let last_solve_display = user.last_solve === "Never" ? "Never" : 
      new Date(user.last_solve).toLocaleDateString();
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${user.username}${user.username === current_user ? ' (You)' : ''}</td>
      <td>${user.total_score}</td>
      <td>${user.solve_count}</td>
      <td>${last_solve_display}</td>
    `;
    tbody.appendChild(row);
  });
}

function truncate(str, length) {
  return str.length > length ? str.substring(0, length) + "..." : str;
}