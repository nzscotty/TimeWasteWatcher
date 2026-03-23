// default limits (in minutes) for common social media sites
const DEFAULT_LIMITS = {
    "facebook.com": { daily: 30, hourly: 0 },
    "instagram.com": { daily: 30, hourly: 0 },
    "x.com": { daily: 30, hourly: 0 },
    "reddit.com": { daily: 30, hourly: 0 },
    "youtube.com": { daily: 30, hourly: 0 },
    "tiktok.com": { daily: 30, hourly: 0 },
    "snapchat.com": { daily: 30, hourly: 0 },
  };

  function getAllTrackedDomains(storedLimits = {}) {
    return [...new Set([...Object.keys(DEFAULT_LIMITS), ...Object.keys(storedLimits)])];
  }
  
  // in-memory usage data (in seconds)
  let usageData = {};
  let activeTabId = null;
  let activeWindowId = null;

  function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getHourKey(date = new Date()) {
    return `${getDateKey(date)}-${String(date.getHours()).padStart(2, "0")}`;
  }

  function normalizeLimit(limit, fallback) {
    if (typeof limit === "number") {
      return {
        daily: limit,
        hourly: 0,
      };
    }

    return {
      daily: typeof limit?.daily === "number" ? limit.daily : fallback.daily,
      hourly: typeof limit?.hourly === "number" ? limit.hourly : fallback.hourly,
    };
  }

  function hasActiveLimit(limit) {
    return Boolean(limit) && ((limit.daily || 0) > 0 || (limit.hourly || 0) > 0);
  }

  function normalizeUsageEntry(domain, now = new Date()) {
    const dateKey = getDateKey(now);
    const hourKey = getHourKey(now);
    const existingEntry = usageData[domain];

    let entry;
    if (typeof existingEntry === "number") {
      entry = {
        dateKey,
        dailySeconds: existingEntry,
        hourKey,
        hourlySeconds: 0,
      };
    } else {
      entry = {
        dateKey: existingEntry?.dateKey || dateKey,
        dailySeconds: existingEntry?.dailySeconds || 0,
        hourKey: existingEntry?.hourKey || hourKey,
        hourlySeconds: existingEntry?.hourlySeconds || 0,
      };
    }

    if (entry.dateKey !== dateKey) {
      entry.dateKey = dateKey;
      entry.dailySeconds = 0;
    }

    if (entry.hourKey !== hourKey) {
      entry.hourKey = hourKey;
      entry.hourlySeconds = 0;
    }

    usageData[domain] = entry;
    return entry;
  }

  function loadUsage() {
    chrome.storage.local.get(["usageData"], (result) => {
      usageData = result.usageData || {};
      const now = new Date();
      Object.keys(usageData).forEach((domain) => normalizeUsageEntry(domain, now));
      saveUsage();
    });
  }
  
  // current site domain for active tab
  function getDomain(url) {
    try {
      let hostname = new URL(url).hostname;
      if (hostname.startsWith("www.")) {
        hostname = hostname.slice(4);
      }
      return hostname;
    } catch (e) {
      return null;
    }
  }

  function findTrackedDomain(hostname, limits) {
    if (!hostname) {
      return null;
    }

    return Object.keys(limits)
      .sort((left, right) => right.length - left.length)
      .find((site) => hostname === site || hostname.endsWith(`.${site}`)) || null;
  }
  
  // load user-defined limits or use defaults
  function getLimits(callback) {
    chrome.storage.local.get(["limits"], (result) => {
      const storedLimits = result.limits || {};
      const normalizedLimits = {};

      getAllTrackedDomains(storedLimits).forEach((domain) => {
        normalizedLimits[domain] = normalizeLimit(storedLimits[domain], DEFAULT_LIMITS[domain] || { daily: 30, hourly: 0 });
      });

      callback(normalizedLimits);
    });
  }
  
  // Save usageData to storage (if needed) or keep in memory for now.
  function saveUsage() {
    chrome.storage.local.set({ usageData });
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
      const hostname = getDomain(tab.url);
      if (!hostname) return;
      getLimits((limits) => {
        const now = new Date();
        const domain = findTrackedDomain(hostname, limits);
        if (!domain) {
          chrome.tabs.sendMessage(activeTabId, { type: "unblock" });
          return;
        }

        const siteLimit = limits[domain];

        // if this domain is being tracked
        if (hasActiveLimit(siteLimit)) {
          const usageEntry = normalizeUsageEntry(domain, now);
          usageEntry.dailySeconds += 1;
          usageEntry.hourlySeconds += 1;
          saveUsage();

          const dailyExceeded = siteLimit.daily > 0 && usageEntry.dailySeconds >= siteLimit.daily * 60;
          const hourlyExceeded = siteLimit.hourly > 0 && usageEntry.hourlySeconds >= siteLimit.hourly * 60;

          if (dailyExceeded || hourlyExceeded) {
            chrome.tabs.sendMessage(activeTabId, {
              type: "block",
              domain,
              limitType: hourlyExceeded ? "hourly" : "daily",
            });
            return;
          }
        }

        chrome.tabs.sendMessage(activeTabId, { type: "unblock" });
      });
    });
  }, 1000);
  
  // Listen for reset messages from content script after 10 clicks.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "resetTime" && message.domain) {
      const now = new Date();
      usageData[message.domain] = {
        dateKey: getDateKey(now),
        dailySeconds: 0,
        hourKey: getHourKey(now),
        hourlySeconds: 0,
      };
      saveUsage();
      // Remove the block overlay from the tab that sent the message
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, { type: "unblock" });
      }
      sendResponse({ status: "ok" });
    }
  });

  loadUsage();
  updateActiveTab();
  