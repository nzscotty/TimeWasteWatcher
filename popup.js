// Predefined social media sites
const sites = ["facebook.com", "instagram.com", "x.com", "reddit.com", "youtube.com", "tiktok.com", "snapchat.com"];

const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_HOURLY_LIMIT = 0;

function normalizeLimit(limit) {
  if (typeof limit === "number") {
    return {
      daily: limit,
      hourly: DEFAULT_HOURLY_LIMIT,
    };
  }

  return {
    daily: typeof limit?.daily === "number" ? limit.daily : DEFAULT_DAILY_LIMIT,
    hourly: typeof limit?.hourly === "number" ? limit.hourly : DEFAULT_HOURLY_LIMIT,
  };
}

function normalizeSiteInput(value) {
  const trimmedValue = value.trim().toLowerCase();
  if (!trimmedValue) {
    return null;
  }

  const candidate = trimmedValue.includes("://") ? trimmedValue : `https://${trimmedValue}`;

  try {
    let hostname = new URL(candidate).hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    if (!hostname || !hostname.includes(".")) {
      return null;
    }

    return hostname;
  } catch (error) {
    return null;
  }
}

function getStoredSites(limits) {
  return Object.keys(limits || {});
}

function getAllSites(limits) {
  return [...new Set([...sites, ...getStoredSites(limits)])].sort((left, right) => left.localeCompare(right));
}

function collectLimitsFromTable() {
  let newLimits = {};

  document.querySelectorAll("#limitsTable tr[data-site]").forEach((row) => {
    const site = row.dataset.site;
    const dailyValue = parseInt(document.getElementById(`daily-limit-${site}`).value, 10);
    const hourlyValue = parseInt(document.getElementById(`hourly-limit-${site}`).value, 10);

    newLimits[site] = {
      daily: isNaN(dailyValue) ? DEFAULT_DAILY_LIMIT : dailyValue,
      hourly: isNaN(hourlyValue) ? DEFAULT_HOURLY_LIMIT : hourlyValue,
    };
  });

  sites.forEach((site) => {
    if (!newLimits[site]) {
      newLimits[site] = {
        daily: DEFAULT_DAILY_LIMIT,
        hourly: DEFAULT_HOURLY_LIMIT,
      };
    }
  });

  return newLimits;
}

function saveLimits() {
  const newLimits = collectLimitsFromTable();
  chrome.storage.local.set({ limits: newLimits });
}

function createRemoveButton(site) {
  const actionCell = document.createElement("td");

  if (!sites.includes(site)) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-site-btn";
    removeButton.innerText = "Remove";
    removeButton.addEventListener("click", () => {
      document.querySelector(`tr[data-site="${site}"]`)?.remove();
      saveLimits();
    });
    actionCell.appendChild(removeButton);
  }

  return actionCell;
}

function appendSiteRow(table, site, limit) {
  if (document.querySelector(`tr[data-site="${site}"]`)) {
    return;
  }

  const siteLimits = normalizeLimit(limit);
  const row = document.createElement("tr");
  row.dataset.site = site;

  const siteCell = document.createElement("td");
  siteCell.innerText = site;
  row.appendChild(siteCell);

  const inputCell = document.createElement("td");
  const dailyInput = document.createElement("input");
  dailyInput.type = "number";
  dailyInput.min = "0";
  dailyInput.value = siteLimits.daily;
  dailyInput.id = `daily-limit-${site}`;
  dailyInput.addEventListener("blur", saveLimits);
  inputCell.appendChild(dailyInput);
  row.appendChild(inputCell);

  const hourlyInputCell = document.createElement("td");
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "number";
  hourlyInput.min = "0";
  hourlyInput.value = siteLimits.hourly;
  hourlyInput.id = `hourly-limit-${site}`;
  hourlyInput.addEventListener("blur", saveLimits);
  hourlyInputCell.appendChild(hourlyInput);
  row.appendChild(hourlyInputCell);

  row.appendChild(createRemoveButton(site));
  table.appendChild(row);
}

// Load stored limits or default values
chrome.storage.local.get(["limits"], (result) => {
  const limits = result.limits || {};
  const table = document.getElementById("limitsTable");

  getAllSites(limits).forEach((site) => {
    appendSiteRow(table, site, limits[site]);
  });
});

document.getElementById("addSiteBtn").addEventListener("click", () => {
  const newSiteInput = document.getElementById("newSiteInput");
  const site = normalizeSiteInput(newSiteInput.value);

  if (!site) {
    alert("Enter a valid website domain.");
    return;
  }

  appendSiteRow(document.getElementById("limitsTable"), site, {
    daily: DEFAULT_DAILY_LIMIT,
    hourly: DEFAULT_HOURLY_LIMIT,
  });
  newSiteInput.value = "";
  saveLimits();
});

document.getElementById("newSiteInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("addSiteBtn").click();
  }
});
