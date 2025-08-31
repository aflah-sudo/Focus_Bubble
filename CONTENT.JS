let start_time = null;
let is_problem_page = false;
let detection_attempts = 0;
let max_detection_attempts = 10;
let accepted_observer = null;

console.log("🔍 LeetCode Tracker content script loaded on:", window.location.href);

// Enhanced initialization with multiple detection strategies
function initialize_tracker() {
  if (window.location.search) {
    console.log("📌 Skipping initialization on query params");
    return;
  }

  detection_attempts++;
  console.log(`🔍 Detection attempt ${detection_attempts}/${max_detection_attempts}`);
  
  // Strategy 1: URL-based detection
  const url_match = window.location.href.match(/leetcode\.com\/problems\/([^\/\?]+)/);
  
  // Strategy 2: DOM-based detection
  const problem_title = document.querySelector('h1[data-cy="question-title"], h1[class*="title"], .question-title h1');
  const code_editor = document.querySelector('div[class*="monaco"], .monaco-editor, div[data-cy="code-area"]');
  
  if (url_match || (problem_title && code_editor)) {
    is_problem_page = true;
    const problem_slug = url_match ? url_match[1] : "unknown";
    console.log("✅ LeetCode problem detected:", problem_slug);
    start_timer();
    setup_solve_detection();
    return;
  }
  
  // Strategy 3: Wait for dynamic content
  if (detection_attempts < max_detection_attempts) {
    console.log("⏳ Problem not detected yet, retrying in 1s...");
    setTimeout(initialize_tracker, 1000);
  } else {
    console.log("❌ Max detection attempts reached - not a problem page");
  }
}

// Multi-trigger initialization
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize_tracker);
} else {
  initialize_tracker();
}

window.addEventListener("load", () => {
  if (!is_problem_page) initialize_tracker();
});

// Enhanced timer management
function start_timer() {
  if (start_time) {
    console.log("⏱️ Timer already running since:", new Date(start_time).toLocaleTimeString());
    return;
  }
  
  if (window.location.search) {
    console.log("📌 Skipping timer start on query params");
    return;
  }
  
  start_time = Date.now();
  console.log("⏱️ Timer started at:", new Date(start_time).toLocaleTimeString());
  
  // Notify background script with retry
  send_timer_message("start_timer", 3);
}

function send_timer_message(type, retries = 1) {
  if (!chrome.runtime.id) {
    console.log("❌ Extension context invalidated, skipping message:", type);
    return;
  }
  
  chrome.runtime.sendMessage({ type }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("❌ Timer message failed:", chrome.runtime.lastError.message);
      if (retries > 0) {
        setTimeout(() => send_timer_message(type, retries - 1), 500);
      }
    } else if (response?.status?.includes("started")) {
      console.log("✅ Timer message sent successfully");
    }
  });
}

// Enhanced solve detection
function setup_solve_detection() {
  // Strategy 1: Watch for "Accepted" text
  setup_accepted_observer();
  
  // Strategy 3: Page visibility handling
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      console.log("👁️ Page hidden");
    } else {
      console.log("👁️ Page visible - rechecking solve status");
      setup_accepted_observer(); // Restart observer
    }
  });
}

function setup_accepted_observer() {
  if (accepted_observer) {
    accepted_observer.disconnect();
  }
  
  console.log("👀 Setting up solve detection observer");
  
  accepted_observer = new MutationObserver((mutations) => {
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        for (let node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            let text_content = node.textContent || "";
            
            // Check for the specific submission result element first
            if (node.nodeType === Node.ELEMENT_NODE) {
              let submissionResult = node.querySelector ? node.querySelector('[data-e2e-locator="submission-result"]') : null;
              if (!submissionResult && node.getAttribute && node.getAttribute('data-e2e-locator') === 'submission-result') {
                submissionResult = node;
              }
              
              if (submissionResult && /Accepted/i.test(submissionResult.textContent)) {
                console.log("🎉 SOLVE DETECTED via submission-result element!");
                handle_solve_detected();
                accepted_observer.disconnect();
                return;
              }
            }
            
            // Fallback: Look for solve indicators but filter out navigation text
            if (/Accepted|Runtime:|Memory:|Congratulations/i.test(text_content)) {
              
              // Skip obvious navigation/metadata sections
              if (/Companies.*Topics|Difficulty.*Companies|Problems.*Companies/i.test(text_content) ||
                  /HardTopicsCompanies/i.test(text_content) ||
                  text_content.length > 200) { // Very long text is probably not a solve message
                console.log("🚫 Ignoring navigation text:", text_content.substring(0, 50));
                continue;
              }
              
              console.log("🎉 SOLVE DETECTED! Text:", text_content.substring(0, 50));
              handle_solve_detected();
              accepted_observer.disconnect();
              return;
            }
          }
        }
      }
      
      // Also check for attribute changes that might indicate success
      if (mutation.type === "attributes") {
        let target = mutation.target;
        if (target.className && target.className.includes && 
           (target.className.includes("accepted") || target.className.includes("success"))) {
          console.log("🎉 SOLVE DETECTED via class change!");
          handle_solve_detected();
          accepted_observer.disconnect();
          return;
        }
      }
    }
  });

  // Observe multiple potential containers
  let targets = [
    document.body,
    document.querySelector('div[data-cy="submission-result"]'),
    document.querySelector('div[class*="result"]'),
    document.querySelector('div[class*="submission"]'),
    document.querySelector('[data-e2e-locator="submission-result"]')
  ].filter(Boolean);
  
  targets.forEach(target => {
    accepted_observer.observe(target, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['class']
    });
  });
}
// Handle solve detection
function handle_solve_detected() {
  if (!start_time) {
    console.log("❌ No timer running - ignoring solve detection");
    return;
  }
  
  console.log("🎯 Processing solve...");
  
  // Extract problem data
  let problem_data = extract_problem_data();
  
  if (!problem_data.title || problem_data.title === "Unknown Problem") {
    console.log("⚠️ Could not extract problem title - using fallback");
  }
  
  console.log("📝 Solve data:", problem_data);
  
  // Send to background script
  chrome.runtime.sendMessage({
    type: "solve_accepted",
    data: problem_data
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("❌ Failed to send solve data:", chrome.runtime.lastError.message);
      return;
    }
    
    if (!response) {
      console.log("❌ No response from background script");
      return;
    }
    
    console.log("📤 Solve data sent - Response:", response.status);
    
    // Handle response
    switch (response.status) {
      case "duplicate_detected":
        show_notification(`Already solved: "${response.title}"`, "warning");
        break;
      case "solve_processed":
        show_notification(`Solve recorded! +${response.score} points`, "success");
        break;
      default:
        console.log("❓ Unexpected response:", response);
    }
  });
}

// Extract problem data with multiple strategies
function extract_problem_data() {
  // Get slug from URL
  let url_match = window.location.href.match(/leetcode\.com\/problems\/([^\/\?]+)/);
  let slug = url_match ? url_match[1] : "unknown";
  
  // Get title with multiple selectors
  let title_selectors = [
    'h1[data-cy="question-title"]',
    'h1[class*="title"]', 
    '.question-title h1',
    'h1',
    '[data-cy="question-title"]'
  ];
  
  let title = "Unknown Problem";
  for (let selector of title_selectors) {
    let element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      title = element.textContent.replace(/^\d+\.\s*/, "").trim(); // Remove number prefix
      break;
    }
  }
  
  // Fallback: generate title from slug
  if (title === "Unknown Problem" && slug !== "unknown") {
    title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  
  // Get difficulty with multiple selectors
  let difficulty_selectors = [
    'div[data-cy*="difficulty"]',
    'span[class*="difficulty"], div[class*="difficulty"]',
    'span[class*="text-olive"], span[class*="text-yellow"], span[class*="text-pink"]',
    'div[class*="text-difficulty-easy"], div[class*="text-difficulty-medium"], div[class*="text-difficulty-hard"]',
    '[class*="difficulty"]'
  ];

  let difficulty = "Medium"; // Default fallback
  for (let selector of difficulty_selectors) {
    let element = document.querySelector(selector);
    if (element) {
      let text = element.textContent.trim();
      if (/Easy|Medium|Hard/i.test(text)) {
        difficulty = text.match(/Easy|Medium|Hard/i)[0];
        break;
      }
    }
  }
  // Fallback: Poll for difficulty if not found immediately
  if (difficulty === "Medium") {
    setTimeout(() => {
      for (let selector of difficulty_selectors) {
        let element = document.querySelector(selector);
        if (element && /Easy|Medium|Hard/i.test(element.textContent.trim())) {
          difficulty = element.textContent.trim().match(/Easy|Medium|Hard/i)[0];
          break;
        }
      }
    }, 1000);
  }
  
  let time_taken_sec = Math.round((Date.now() - start_time) / 1000);
  
  return {
    title,
    slug,
    url: window.location.href,
    difficulty,
    time_taken_sec
  };
}

// Show notification
function show_notification(message, type = "info") {
  console.log(`📢 ${type.toUpperCase()}: ${message}`);
  
  // Create notification element
  let notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: -apple-system, sans-serif;
    font-weight: 600;
    color: white;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    background: ${type === "success" ? "#27ae60" : type === "warning" ? "#f39c12" : "#3498db"};
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.style.transform = "translateX(0)", 100);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.transform = "translateX(100%)";
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Cleanup function
function cleanup_and_stop() {
  if (is_problem_page) {
    console.log("🧹 Cleaning up - stopping timer and observers");
    
    if (accepted_observer) {
      accepted_observer.disconnect();
      accepted_observer = null;
    }
    
    try {
      send_timer_message("stop_timer");
    } catch (e) {
      console.log("❌ Failed to send stop_timer message during cleanup:", e.message);
    }
    
    start_time = null;
    is_problem_page = false;
  }
}

// Cleanup on page unload
window.addEventListener("beforeunload", cleanup_and_stop);
window.addEventListener("unload", cleanup_and_stop);