// Predefined social media sites
const sites = ["facebook.com", "instagram.com", "x.com", "reddit.com", "youtube.com", "tiktok.com", "snapchat.com"];

const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_HOURLY_LIMIT = 0;

function getOriginPatterns(site) {
  return [
    `http://${site}/*`,
    `https://${site}/*`,
    `http://*.${site}/*`,
    `https://*.${site}/*`,
  ];
}

function normalizeLimit(limit) {
  const dailyValue = Number(limit?.daily);
  const hourlyValue = Number(limit?.hourly);

  if (typeof limit === "number") {
    return {
      daily: limit,
      hourly: DEFAULT_HOURLY_LIMIT,
    };
  }

  return {
    daily: Number.isFinite(dailyValue) ? dailyValue : DEFAULT_DAILY_LIMIT,
    hourly: Number.isFinite(hourlyValue) ? hourlyValue : DEFAULT_HOURLY_LIMIT,
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
  actionCell.className = "action-cell";

  if (!sites.includes(site)) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-site-btn";
    removeButton.innerHTML = "&times;";
    removeButton.setAttribute("aria-label", `Remove ${site}`);
    removeButton.title = `Remove ${site}`;
    removeButton.addEventListener("click", () => {
      document.querySelector(`tr[data-site="${site}"]`)?.remove();
      chrome.permissions.remove({ origins: getOriginPatterns(site) }, () => {
        saveLimits();
      });
    });
    actionCell.appendChild(removeButton);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "empty-actions";
    spacer.setAttribute("aria-hidden", "true");
    actionCell.appendChild(spacer);
  }

  return actionCell;
}

function appendSiteRow(table, site, limit) {
  const tableBody = table.tBodies[0] || table;

  if (document.querySelector(`tr[data-site="${site}"]`)) {
    return;
  }

  const siteLimits = normalizeLimit(limit);
  const row = document.createElement("tr");
  row.dataset.site = site;

  const siteCell = document.createElement("td");
  siteCell.className = "site-cell";

  const siteContent = document.createElement("div");
  siteContent.className = "site-content";

  const siteName = document.createElement("span");
  siteName.className = "site-name";
  siteName.innerText = site;
  siteContent.appendChild(siteName);

  siteCell.appendChild(siteContent);
  row.appendChild(siteCell);

  const inputCell = document.createElement("td");
  const dailyInput = document.createElement("input");
  dailyInput.type = "number";
  dailyInput.min = "0";
  dailyInput.value = siteLimits.daily;
  dailyInput.id = `daily-limit-${site}`;
  dailyInput.className = "number-input";
  dailyInput.placeholder = "0";
  dailyInput.setAttribute("aria-label", `Daily limit for ${site} in minutes`);
  dailyInput.addEventListener("blur", saveLimits);
  inputCell.appendChild(dailyInput);
  row.appendChild(inputCell);

  const hourlyInputCell = document.createElement("td");
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "number";
  hourlyInput.min = "0";
  hourlyInput.value = siteLimits.hourly;
  hourlyInput.id = `hourly-limit-${site}`;
  hourlyInput.className = "number-input";
  hourlyInput.placeholder = "0";
  hourlyInput.setAttribute("aria-label", `Hourly limit for ${site} in minutes`);
  hourlyInput.addEventListener("blur", saveLimits);
  hourlyInputCell.appendChild(hourlyInput);
  row.appendChild(hourlyInputCell);

  row.appendChild(createRemoveButton(site));
  tableBody.appendChild(row);
}

// Load stored limits or default values
chrome.storage.local.get(["limits"], (result) => {
  const limits = result.limits || {};
  const table = document.getElementById("limitsTable");

  getAllSites(limits).forEach((site) => {
    appendSiteRow(table, site, limits[site]);
  });
});

function addSite() {
  const newSiteInput = document.getElementById("newSiteInput");
  const site = normalizeSiteInput(newSiteInput.value);

  if (!site) {
    alert("Enter a valid website domain.");
    return false;
  }

  if (document.querySelector(`tr[data-site="${site}"]`)) {
    newSiteInput.value = "";
    return true;
  }

  const finalizeAdd = () => {
    appendSiteRow(document.getElementById("limitsTable"), site, {
      daily: DEFAULT_DAILY_LIMIT,
      hourly: DEFAULT_HOURLY_LIMIT,
    });
    newSiteInput.value = "";
    saveLimits();
  };

  if (sites.includes(site)) {
    finalizeAdd();
    return true;
  }

  chrome.permissions.request({ origins: getOriginPatterns(site) }, (granted) => {
    if (!granted) {
      alert("Site permission is required to track that website.");
      return;
    }

    finalizeAdd();
  });
  return true;
}

document.getElementById("newSiteInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSite();
  }
});
