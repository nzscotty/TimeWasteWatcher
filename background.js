// default limits (in minutes) for common social media sites
const DEFAULT_LIMITS = {
    "facebook.com": 30,
    "instagram.com": 30,
    "x.com": 30,
    "reddit.com": 30,
    "youtube.com": 30,
    "tiktok.com": 30,
    "snapchat.com": 30,
  };
  
  // in-memory usage data (in seconds)
  let usageData = {};
  let activeTabId = null;
  let activeWindowId = null;
  
  // current site domain for active tab
  function getDomain(url) {
    try {
      let hostname = new URL(url).hostname;
      // remove subdomains if needed (e.g. www.facebook.com -> facebook.com)
      let parts = hostname.split('.');
      if (parts.length > 2) {
        hostname = parts.slice(parts.length - 2).join('.');
      }
      return hostname;
    } catch (e) {
      return null;
    }
  }
  
  // load user-defined limits or use defaults
  function getLimits(callback) {
    chrome.storage.local.get(["limits"], (result) => {
      callback(result.limits || DEFAULT_LIMITS);
    });
  }
  
  // Save usageData to storage (if needed) or keep in memory for now.
  function saveUsage() {
    chrome.storage.local.set({ usageData });
  }
  
  // Reset usage data at midnight
  function scheduleMidnightReset() {
    // Calculate milliseconds until next midnight
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight - now;
    setTimeout(() => {
      usageData = {};
      saveUsage();
      // inform all tabs to remove the block overlay if any
      chrome.tabs.query({}, (tabs) => {
        for (let tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: "unblock" });
        }
      });
      // reschedule for the next day
      scheduleMidnightReset();
    }, msUntilMidnight);
  }
  
  // update the current active tab info
  function updateActiveTab() {
    chrome.windows.getLastFocused({ populate: true }, (window) => {
      if (window.focused) {
        const active = window.tabs.find(tab => tab.active);
        if (active) {
          activeTabId = active.id;
          activeWindowId = window.id;
        }
      } else {
        activeTabId = null;
        activeWindowId = null;
      }
    });
  }
  
  // Listen for tab activation and window focus changes.
  chrome.tabs.onActivated.addListener(updateActiveTab);
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      activeTabId = null;
      activeWindowId = null;
    } else {
      updateActiveTab();
    }
  });
  
  // Main timer: every second, add to usage if active tab is on a limited site.
  setInterval(() => {
    if (!activeTabId) return;
    chrome.tabs.get(activeTabId, (tab) => {
      if (chrome.runtime.lastError || !tab.url) return;
      const domain = getDomain(tab.url);
      if (!domain) return;
      getLimits((limits) => {
        // if this domain is being tracked
        if (limits[domain]) {
          // initialize usage if not already set
          if (!usageData[domain]) usageData[domain] = 0;
          usageData[domain] += 1; // add 1 second
          saveUsage();
          const limitSeconds = limits[domain] * 60;
          if (usageData[domain] >= limitSeconds) {
            // if limit reached, send message to content script in this tab
            chrome.tabs.sendMessage(activeTabId, { type: "block", domain });
          }
        }
      });
    });
  }, 1000);
  
  // Listen for reset messages from content script after 10 clicks.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "resetTime" && message.domain) {
      // Reset usage for that domain so user can continue using it for the day
      usageData[message.domain] = 0;
      saveUsage();
      // Remove the block overlay from the tab that sent the message
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, { type: "unblock" });
      }
      sendResponse({ status: "ok" });
    }
  });
    
  // Schedule the first midnight reset
  scheduleMidnightReset();
  