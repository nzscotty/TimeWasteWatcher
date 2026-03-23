if (!globalThis.__timeWasteWatcherInjected) {
globalThis.__timeWasteWatcherInjected = true;

// Helper: Extract the domain (e.g. facebook.com) from a URL.
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

function normalizeLimit(limit) {
  const dailyValue = Number(limit?.daily);
  const hourlyValue = Number(limit?.hourly);

  if (typeof limit === "number") {
    return {
      daily: limit,
      hourly: 0,
    };
  }

  return {
    daily: Number.isFinite(dailyValue) ? dailyValue : 0,
    hourly: Number.isFinite(hourlyValue) ? hourlyValue : 0,
  };
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getHourKey(date = new Date()) {
  return `${getDateKey(date)}-${String(date.getHours()).padStart(2, "0")}`;
}

function normalizeUsageEntry(entry, now = new Date()) {
  const dateKey = getDateKey(now);
  const hourKey = getHourKey(now);

  if (typeof entry === "number") {
    return {
      dateKey,
      dailySeconds: entry,
      hourKey,
      hourlySeconds: 0,
    };
  }

  const normalizedEntry = {
    dateKey: entry?.dateKey || dateKey,
    dailySeconds: entry?.dailySeconds || 0,
    hourKey: entry?.hourKey || hourKey,
    hourlySeconds: entry?.hourlySeconds || 0,
  };

  if (normalizedEntry.dateKey !== dateKey) {
    normalizedEntry.dateKey = dateKey;
    normalizedEntry.dailySeconds = 0;
  }

  if (normalizedEntry.hourKey !== hourKey) {
    normalizedEntry.hourKey = hourKey;
    normalizedEntry.hourlySeconds = 0;
  }

  return normalizedEntry;
}

function formatRemainingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds}`;
}

function buildCountdownMarkup(siteLimit, usageEntry) {
  const lines = [];

  if (siteLimit.daily > 0) {
    lines.push(`<div>Daily left: ${formatRemainingTime(Math.max(0, siteLimit.daily * 60 - usageEntry.dailySeconds))}</div>`);
  }

  if (siteLimit.hourly > 0) {
    lines.push(`<div>Hourly left: ${formatRemainingTime(Math.max(0, siteLimit.hourly * 60 - usageEntry.hourlySeconds))}</div>`);
  }

  return lines.join("");
}

function hasActiveLimit(limit) {
  return Boolean(limit) && ((limit.daily || 0) > 0 || (limit.hourly || 0) > 0);
}
  
  // --- Countdown Timer Overlay ---
  
  let countdownOverlay = null;
  let countdownInterval = null;
  
  // Create the countdown timer overlay
  function createCountdownOverlay() {
    if (countdownOverlay) return;
  
    countdownOverlay = document.createElement("div");
    countdownOverlay.id = "countdownOverlay";
    countdownOverlay.style.position = "fixed";
    countdownOverlay.style.bottom = "10px";
    countdownOverlay.style.right = "10px";
    countdownOverlay.style.padding = "8px 12px";
    countdownOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
    countdownOverlay.style.color = "white";
    countdownOverlay.style.fontSize = "14px";
    countdownOverlay.style.borderRadius = "4px";
    countdownOverlay.style.cursor = "move";
    countdownOverlay.style.zIndex = "10000";
    countdownOverlay.innerHTML = "";
    document.body.appendChild(countdownOverlay);
  
    // Setup dragging
    makeDraggable(countdownOverlay);
    // Start the timer update loop
    countdownInterval = setInterval(updateCountdown, 1000);
  }
  
  // Remove the countdown overlay
  function removeCountdownOverlay() {
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
      clearInterval(countdownInterval);
    }
  }
  
  // Update the countdown timer text based on stored usage and limits
  function updateCountdown() {
    const hostname = getDomain(window.location.href);
    if (!hostname) return;
    
    chrome.storage.local.get(["usageData", "limits"], (result) => {
      let usageData = result.usageData || {};
      let limits = result.limits || {};
      const domain = findTrackedDomain(hostname, limits);
      if (!domain) {
        countdownOverlay.style.display = "none";
        return;
      }

      const siteLimit = normalizeLimit(limits[domain]);
      const usageEntry = normalizeUsageEntry(usageData[domain]);

      // Only show timer if the current site is being tracked
      if (siteLimit.daily <= 0 && siteLimit.hourly <= 0) {
        countdownOverlay.style.display = "none";
        return;
      }

      countdownOverlay.style.display = "block";
      countdownOverlay.innerHTML = buildCountdownMarkup(siteLimit, usageEntry);
    });
  }
  
  // --- Drag & Snap Functionality ---
  
  function makeDraggable(elm) {
    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
  
    elm.addEventListener("mousedown", dragMouseDown);
  
    function dragMouseDown(e) {
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      document.addEventListener("mousemove", elementDrag);
      document.addEventListener("mouseup", closeDragElement);
    }
  
    function elementDrag(e) {
      e.preventDefault();
      // Calculate the new cursor position:
      posX = mouseX - e.clientX;
      posY = mouseY - e.clientY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      // Set the element's new position:
      const rect = elm.getBoundingClientRect();
      elm.style.top = (rect.top - posY) + "px";
      elm.style.left = (rect.left - posX) + "px";
      // Remove fixed positioning while dragging so we can reposition absolutely.
      elm.style.bottom = "auto";
      elm.style.right = "auto";
      elm.style.position = "absolute";
    }
  
    function closeDragElement() {
      document.removeEventListener("mouseup", closeDragElement);
      document.removeEventListener("mousemove", elementDrag);
      snapToCorner(elm);
    }
  }
  
  // Snap the element to the nearest corner of the viewport.
  function snapToCorner(elm) {
    const rect = elm.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
  
    // Compute distances to each corner
    const distTopLeft = Math.hypot(rect.left, rect.top);
    const distTopRight = Math.hypot(windowWidth - rect.right, rect.top);
    const distBottomLeft = Math.hypot(rect.left, windowHeight - rect.bottom);
    const distBottomRight = Math.hypot(windowWidth - rect.right, windowHeight - rect.bottom);
  
    // Determine the minimum distance
    const minDist = Math.min(distTopLeft, distTopRight, distBottomLeft, distBottomRight);
    let snapStyle = { top: "auto", left: "auto", bottom: "10px", right: "10px" }; // default to bottom-right
  
    if (minDist === distTopLeft) {
      snapStyle = { top: "10px", left: "10px", bottom: "auto", right: "auto" };
    } else if (minDist === distTopRight) {
      snapStyle = { top: "10px", right: "10px", bottom: "auto", left: "auto" };
    } else if (minDist === distBottomLeft) {
      snapStyle = { bottom: "10px", left: "10px", top: "auto", right: "auto" };
    } // else remains bottom-right
  
    // Apply the new styles and reset to fixed positioning.
    elm.style.position = "fixed";
    elm.style.top = snapStyle.top;
    elm.style.left = snapStyle.left;
    elm.style.bottom = snapStyle.bottom;
    elm.style.right = snapStyle.right;
  }
  
  // --- Block Overlay (existing functionality) ---
  
  let blockOverlay = null;
  let clickCount = 0;
  
  function createBlockOverlay(domain, limitType) {
    if (blockOverlay) return;

    const limitLabel = limitType === "hourly" ? "hourly" : "daily";
  
    blockOverlay = document.createElement("div");
    blockOverlay.style.position = "fixed";
    blockOverlay.style.top = "0";
    blockOverlay.style.left = "0";
    blockOverlay.style.width = "100%";
    blockOverlay.style.height = "100%";
    blockOverlay.style.backgroundColor = "rgba(0,0,0,0.8)";
    blockOverlay.style.zIndex = "9999";
    blockOverlay.style.color = "white";
    blockOverlay.style.display = "flex";
    blockOverlay.style.flexDirection = "column";
    blockOverlay.style.justifyContent = "center";
    blockOverlay.style.alignItems = "center";
    blockOverlay.style.fontSize = "20px";
    blockOverlay.style.textAlign = "center";
    blockOverlay.innerHTML = `<div style="padding:20px;">
        <p>You have reached your ${limitLabel} limit on ${domain}.</p>
        <p>Click the button below 10 times in a row to reset the timer.</p>
        <button id="resetButton" style="font-size: 18px; padding: 10px 20px;">Reset Timer</button>
        <p id="clickCountText">Clicks: 0/10</p>
      </div>`;
    document.body.appendChild(blockOverlay);
  
    document.getElementById("resetButton").addEventListener("click", () => {
      clickCount++;
      document.getElementById("clickCountText").innerText = `Clicks: ${clickCount}/10`;
      if (clickCount >= 10) {
        chrome.runtime.sendMessage({ type: "resetTime", domain }, () => {
          if (chrome.runtime.lastError) {
            // Ignore cases where the extension context reloads before the response arrives.
          }
        });
        removeBlockOverlay();
      }
    });
  }
  
  function removeBlockOverlay() {
    if (blockOverlay) {
      blockOverlay.remove();
      blockOverlay = null;
      clickCount = 0;
    }
  }
  
  // --- Message Listener from Background ---
  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "block" && message.domain) {
      createBlockOverlay(message.domain, message.limitType);
    } else if (message.type === "unblock") {
      removeBlockOverlay();
    }
  });
  
  // --- Initialize Countdown Overlay if on a limited site ---
  
  (function initTimerOverlay() {
    if (getDomain(window.location.href)) {
      createCountdownOverlay();
    }
  })();

}
  