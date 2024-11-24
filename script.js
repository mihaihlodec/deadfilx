const MAX_ENTRIES = -1; // Set this to any number you want, or -1 for all entries
const HOURLY_RATE = 45;
const FETCH_DURATION_API_DELAY_MS = 250; // 250ms = 1/4 second

async function fetchDuration(videoId) {
  try {
    const response = await fetch("https://web.prod.cloud.netflix.com/graphql", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        operationName: "DetailModal",
        variables: {
          opaqueImageFormat: "WEBP",
          transparentImageFormat: "WEBP",
          videoMerchEnabled: true,
          fetchPromoVideoOverride: false,
          hasPromoVideoOverride: false,
          promoVideoId: 0,
          videoMerchContext: "BROWSE",
          isLiveEpisodic: false,
          artworkContext: {},
          textEvidenceUiContext: "ODP",
          unifiedEntityId: `Video:${videoId}`,
        },
        extensions: {
          persistedQuery: {
            id: "33a2fd97-92a0-4d12-880d-1c103b89c3e3",
            version: 102,
          },
        },
      }),
    });

    const data = await response.json();

    // Extract runtime from the correct path in the response
    const runtimeSeconds = data?.data?.unifiedEntities?.[0]?.runtimeSec;

    if (!runtimeSeconds) {
      return "Duration not found";
    }

    // Convert seconds to minutes
    const runtimeMinutes = Math.floor(runtimeSeconds / 60);
    return `${runtimeMinutes}m`;
  } catch (error) {
    console.error("Error fetching duration:", error);
    throw error;
  }
}

function calculateTotalDuration(watchHistory) {
  const totalMinutes = watchHistory.reduce((sum, entry) => {
    const minutes = parseInt(entry.duration);
    return isNaN(minutes) ? sum : sum + minutes;
  }, 0);

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  console.log("\nTotal Watch Time:");
  console.log(`Minutes: ${totalMinutes}`);
  console.log(
    `Hours: ${hours} (${remainingHours} hours and ${minutes} minutes)`
  );
  console.log(
    `Days: ${days} days, ${remainingHours} hours, and ${minutes} minutes`
  );

  return {
    totalMinutes,
    hours,
    days,
    remainingHours,
    remainingMinutes: minutes,
  };
}

async function loadAllItems() {
  const allItems = new Set();
  let previousSize = 0;
  let attempts = 0;
  const maxAttempts = 3;

  while (true) {
    const currentItems = document.querySelectorAll(".retableRow");
    const currentSize = currentItems.length;

    // Add current items to our set
    currentItems.forEach((row) => {
      const titleLink = row.querySelector(".col.title a");
      if (titleLink) {
        allItems.add(titleLink.href);
      }
    });

    console.log(`Current items count: ${currentSize}`);

    // If we have enough items and a limit is set, stop loading more
    if (MAX_ENTRIES > 0 && currentSize >= MAX_ENTRIES) {
      console.log(`Reached desired limit of ${MAX_ENTRIES} items`);
      break;
    }

    if (currentSize === previousSize) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.log(
          "No more new items. Will continue with fetching duration for the ones we found..."
        );
        break;
      }
    } else {
      attempts = 0;
    }

    const showMoreButton = document.querySelector("button.btn-blue");
    if (!showMoreButton) {
      console.log('No more "Show More" button found.');
      break;
    }

    showMoreButton.click();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    previousSize = currentSize;
  }

  // If we have a limit, return only the first X items
  const itemsArray = Array.from(allItems);
  return MAX_ENTRIES > 0 ? itemsArray.slice(0, MAX_ENTRIES) : itemsArray;
}

async function getNetflixWatchHistory() {
  console.log(
    `Loading${
      MAX_ENTRIES > 0 ? ` first ${MAX_ENTRIES}` : " all"
    } watch history items...`
  );
  const allItemUrls = await loadAllItems();
  console.log(`Total items to process: ${allItemUrls.length}`);

  const watchHistory = [];

  for (const url of allItemUrls) {
    const videoId = url.match(/title\/(\d+)/)?.[1];
    if (!videoId) continue;

    const row = document
      .querySelector(`.retableRow a[href*="${videoId}"]`)
      ?.closest(".retableRow");
    if (!row) continue;

    const entry = {
      title: row.querySelector(".col.title a").textContent.trim(),
      href: url,
      date: row.querySelector(".col.date").textContent.trim(),
      videoId: videoId,
    };

    try {
      console.log(`Fetching duration for: ${entry.title}`);
      const duration = await fetchDuration(videoId);
      entry.duration = duration;
    } catch (error) {
      console.error(`Error fetching duration for ${entry.title}:`, error);
      entry.duration = "Unable to fetch";
    }

    watchHistory.push(entry);
    await new Promise((resolve) =>
      setTimeout(resolve, FETCH_DURATION_API_DELAY_MS)
    );
  }

  console.table(watchHistory);

  const durationStats = calculateTotalDuration(watchHistory);

  // Create text file content directly from watchHistory and durationStats
  let textContent = "Summary of what you LOST just by watching Netflix\n";
  textContent += "======================================================\n\n";
  textContent += `TOTAL Time LOST: ${durationStats.days} days, ${durationStats.remainingHours} hours, and ${durationStats.remainingMinutes} minutes\n`;
  textContent += `TOTAL Money$ LOST: ${(
    durationStats.hours * HOURLY_RATE
  ).toFixed(2)}$ considering you earn ${HOURLY_RATE}$ per hour\n\n`;

  textContent += `Total Minutes: ${durationStats.totalMinutes}\n`;
  textContent += `Total Hours: ${durationStats.hours}\n`;
  textContent += `Total Days: ${durationStats.days}\n`;
  textContent += `Total Items: ${watchHistory.length}\n`;
  textContent += `------------------------------------------------------\n\n`;

  // Add the contribution graph
  let textContentForDownload = textContent;

  textContent += createHorizontalContributionGraph(watchHistory);
  displayGraphInBrowser(textContent);

  textContentForDownload += createContributionGraph(watchHistory);

  textContentForDownload += "Watch History:\n";
  textContentForDownload += "-------------\n";
  textContentForDownload +=
    "Title".padEnd(50) + "Date".padEnd(15) + "Duration\n";
  textContentForDownload += "=".repeat(75) + "\n";

  watchHistory.forEach((entry) => {
    textContentForDownload += entry.title.substring(0, 47).padEnd(50);
    textContentForDownload += entry.date.padEnd(15);
    textContentForDownload += entry.duration + "\n";
  });
  const dataUri =
    "data:text/plain;charset=utf-8," +
    encodeURIComponent(textContentForDownload);
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute("download", "netflix-history.txt");
  linkElement.click();

  // Return watchHistory for console use
  return watchHistory;
}

// Run the script
getNetflixWatchHistory()
  .then((results) => {
    console.log("Completed processing watch history");
  })
  .catch((error) => {
    console.error("Error processing watch history:", error);
  });

function createContributionGraph(watchHistory) {
  // Group watch history by year
  const watchesByYear = {};
  const hoursPerYear = {};

  watchHistory.forEach((entry) => {
    const date = new Date(entry.date);
    const year = date.getFullYear();
    const formattedDate = date.toISOString().split("T")[0];

    // Initialize year data if not exists
    if (!watchesByYear[year]) {
      watchesByYear[year] = new Set();
      hoursPerYear[year] = 0;
    }

    // Add date to watched days
    watchesByYear[year].add(formattedDate);

    // Add duration to year total
    const minutes = parseInt(entry.duration);
    if (!isNaN(minutes)) {
      hoursPerYear[year] += minutes / 60;
    }
  });

  let graphOutput = "Viewing Activity Graph:\n";
  graphOutput += "=====================\n\n";

  // Days of the week labels
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  Object.keys(watchesByYear)
    .sort()
    .forEach((year) => {
      const daysWatched = watchesByYear[year];
      console.log(`Days watched in ${year}: ${daysWatched.size}`);
      graphOutput += `Year ${year}:\n\n`;

      // Create the contribution graph
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);

      // Create array for each day of week
      const weeks = [];
      let currentDate = new Date(startDate);
      let currentWeek = [];

      // Fill in any days before the first day of the year
      const firstDayOffset = startDate.getDay();
      for (let i = 0; i < firstDayOffset; i++) {
        currentWeek.push(null);
      }

      while (currentDate <= endDate) {
        if (currentDate <= new Date()) {
          currentWeek.push(currentDate.toISOString().split("T")[0]);
        } else {
          currentWeek.push(null); // Future dates will be treated as null
        }

        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Fill in any remaining days in the last week
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      if (currentWeek.length) weeks.push(currentWeek);

      const today = new Date();
      const currentWeekNumber = Math.ceil(
        (today - new Date(today.getFullYear(), 0, 1)) /
          (7 * 24 * 60 * 60 * 1000)
      );

      graphOutput += "    "; // Reduced from 5 spaces to 4 to align with 3-letter day names
      for (let week = 1; week <= weeks.length; week++) {
        if (
          year < today.getFullYear() ||
          (year == today.getFullYear() && week <= currentWeekNumber)
        ) {
          // Pad single-digit weeks with a leading zero to maintain alignment
          const weekNum = week < 10 ? ` W${week}` : `W${week}`;
          graphOutput += weekNum.padEnd(4);
        }
      }
      graphOutput += "\n";

      // Print each day of the week
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        graphOutput += `${daysOfWeek[dayIndex]} `;

        for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
          const date = weeks[weekIndex][dayIndex];
          if (date === null) {
            graphOutput += "    "; // Four spaces for null dates (no symbols)
          } else {
            const hasWatch = daysWatched.has(date);
            graphOutput += hasWatch ? "██  " : "░░  ";
          }
        }
        graphOutput += "\n";
      }

      graphOutput += `\nTotal hours watched in ${year}: ${hoursPerYear[
        year
      ].toFixed(1)}\n`;
      graphOutput += `Total days watched in ${year}: ${daysWatched.size}\n`;
      graphOutput += "Legend: ██ = Watched, ░░ = No Activity\n\n";
    });

  return graphOutput;
}

function createHorizontalContributionGraph(watchHistory) {
  // Group watch history by year
  const watchesByYear = {};
  const hoursPerYear = {};

  watchHistory.forEach((entry) => {
    const date = new Date(entry.date);
    const year = date.getFullYear();
    const formattedDate = date.toISOString().split("T")[0];

    // Initialize year data if not exists
    if (!watchesByYear[year]) {
      watchesByYear[year] = new Set();
      hoursPerYear[year] = 0;
    }

    // Add date to watched days
    watchesByYear[year].add(formattedDate);

    // Add duration to year total
    const minutes = parseInt(entry.duration);
    if (!isNaN(minutes)) {
      hoursPerYear[year] += minutes / 60;
    }
  });

  let graphOutput = "\nViewing Activity Graph (Horizontal):\n";
  graphOutput += "================================\n\n";

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();

  Object.keys(watchesByYear)
    .sort()
    .forEach((year) => {
      const daysWatched = watchesByYear[year];
      graphOutput += `Year ${year}:\n\n`;

      // Create the weeks array
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      const weeks = [];
      let currentDate = new Date(startDate);
      let currentWeek = [];

      // Fill in any days before the first day of the year
      const firstDayOffset = startDate.getDay();
      for (let i = 0; i < firstDayOffset; i++) {
        currentWeek.push(null);
      }

      while (currentDate <= endDate) {
        if (currentDate <= today) {
          currentWeek.push(currentDate.toISOString().split("T")[0]);
        } else {
          currentWeek.push(null);
        }

        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Fill in any remaining days in the last week
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      if (currentWeek.length) weeks.push(currentWeek);

      // Display header with day names
      graphOutput += "    "; // 4 spaces before week numbers
      daysOfWeek.forEach((day) => {
        graphOutput += day.padEnd(4);
      });
      graphOutput += "\n";

      // Display each week on its own line
      weeks.forEach((week, weekIndex) => {
        if (
          weekIndex <
            Math.ceil(
              (today - new Date(today.getFullYear(), 0, 1)) /
                (7 * 24 * 60 * 60 * 1000)
            ) ||
          year < today.getFullYear()
        ) {
          graphOutput += `W${String(weekIndex + 1).padStart(2, "0")}: `;

          week.forEach((date) => {
            if (date === null) {
              graphOutput += "    "; // Just 4 spaces for null dates (no symbols)
            } else {
              const hasWatch = daysWatched.has(date);
              graphOutput += hasWatch ? "██ " : "░░ ";
            }
          });
          graphOutput += "\n";
        }
      });

      graphOutput += `\nTotal hours watched in ${year}: ${hoursPerYear[
        year
      ].toFixed(1)}\n`;
      graphOutput += `Total days watched in ${year}: ${daysWatched.size}\n`;
      graphOutput += "Legend: ██ = Watched, ░░ = No Activity\n\n";
    });

  return graphOutput;
}

function displayGraphInBrowser(graphOutput) {
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const popup = document.createElement("div");
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${isDarkMode ? "#242424" : "white"};
    color: ${isDarkMode ? "#e5e5e5" : "black"};
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(0,0,0,0.3);
    z-index: 10000;
    width: 400px; /* approximately 10cm */
    max-height: 600px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.2;
  `;

  // Add close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    color: ${isDarkMode ? "#e5e5e5" : "#666"};
  `;
  closeButton.onclick = () => popup.remove();

  // Add content
  const content = document.createElement("pre");
  content.textContent = graphOutput;
  content.style.cssText = `
    margin: 0;
    padding: 10px;
    background: ${isDarkMode ? "#333" : "#f5f5f5"};
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre;
  `;

  popup.appendChild(closeButton);
  popup.appendChild(content);
  document.body.appendChild(popup);
}
