// Predefined social media sites
const sites = ["facebook.com", "instagram.com", "x.com", "reddit.com", "youtube.com", "tiktok.com", "snapchat.com"];

// Load stored limits or default values
chrome.storage.local.get(["limits"], (result) => {
  const limits = result.limits || {};
  const table = document.getElementById("limitsTable");

  sites.forEach((site) => {
    const row = document.createElement("tr");

    const siteCell = document.createElement("td");
    siteCell.innerText = site;
    row.appendChild(siteCell);

    const inputCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = limits[site] || 30; // default to 30 minutes if not set
    input.id = `limit-${site}`;
    inputCell.appendChild(input);
    row.appendChild(inputCell);

    table.appendChild(row);
  });
});

// Save the limits when clicking the save button
document.getElementById("saveBtn").addEventListener("click", () => {
  let newLimits = {};
  sites.forEach((site) => {
    const value = parseInt(document.getElementById(`limit-${site}`).value, 10);
    newLimits[site] = isNaN(value) ? 30 : value;
  });
  chrome.storage.local.set({ limits: newLimits }, () => {
    alert("Settings saved!");
  });
});
