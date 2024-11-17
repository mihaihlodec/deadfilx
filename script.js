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

// Configuration constant for limiting entries
const MAX_ENTRIES = 5; // Set this to any number you want, or -1 for all entries

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
        console.log("No more new items after multiple attempts, stopping.");
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
      console.log(`Fetching duration for: ${entry.title} (ID: ${videoId})`);
      const duration = await fetchDuration(videoId);
      entry.duration = duration;
    } catch (error) {
      console.error(`Error fetching duration for ${entry.title}:`, error);
      entry.duration = "Unable to fetch";
    }

    watchHistory.push(entry);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.table(watchHistory);

  const durationStats = calculateTotalDuration(watchHistory);

  const outputData = {
    summary: {
      totalItems: watchHistory.length,
      maxEntriesSetting: MAX_ENTRIES,
      watchTime: {
        totalMinutes: durationStats.totalMinutes,
        totalHours: durationStats.hours,
        totalDays: durationStats.days,
        formatted: `${durationStats.days} days, ${durationStats.remainingHours} hours, and ${durationStats.remainingMinutes} minutes`,
      },
    },
    watchHistory: watchHistory,
  };

  const dataStr = JSON.stringify(outputData, null, 2);
  const dataUri =
    "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute("download", "netflix-history.json");
  linkElement.click();

  return outputData;
}

// Run the script
getNetflixWatchHistory()
  .then((results) => {
    console.log("Completed processing watch history");
  })
  .catch((error) => {
    console.error("Error processing watch history:", error);
  });
