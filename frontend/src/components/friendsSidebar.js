import { API_CONFIG } from "../config.js";

export function initFriendsSidebar() {
  // Prevent duplicate initialization if already present
  try {
    if (
      document.getElementById("friends-toggle-btn") ||
      document.getElementById("friends-sidebar")
    ) {
      return;
    }
  } catch {}
  // Minimal, self-contained friends sidebar + toggle button.
  // Assumptions: button width 40px, height 40px.
  const sidebarWidth = "8cm";
  const btnWidth = "12px";
  const btnHeight = "300px";

  // Create sidebar container
  const sidebar = document.createElement("div");
  sidebar.id = "friends-sidebar";
  sidebar.setAttribute("aria-hidden", "true");
  sidebar.style.position = "fixed";
  sidebar.style.top = "0";
  sidebar.style.right = `calc(-1 * ${sidebarWidth})`; // hidden by default
  sidebar.style.width = sidebarWidth;
  sidebar.style.height = "100vh";
  sidebar.style.background = "rgba(93, 76, 160, 1)";
  sidebar.style.borderLeft = "1px solid rgba(83, 96, 212, 0.08)";
  sidebar.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  sidebar.style.zIndex = "9999";
  sidebar.style.transition = "right 0.25s ease-in-out";
  sidebar.style.padding = "10px";
  sidebar.style.overflow = "auto";

  // Header container with title on the left and magnifier button on the right
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.margin = "12px 0 6px 0";

  const title = document.createElement("h3");
  title.textContent = "Friends";
  title.style.margin = "0 0 0 8px";
  title.style.color = "white";
  title.style.fontSize = "1.1rem";
  title.style.fontWeight = "600";
  header.appendChild(title);

  // Container for the action buttons (clock and magnifier)
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.alignItems = "center";
  buttonContainer.style.gap = "4px";

  // Clock button to show sent pending requests
  const clockBtn = document.createElement("button");
  clockBtn.type = "button";
  clockBtn.id = "friends-sent-requests-toggle-btn";
  clockBtn.setAttribute("aria-expanded", "false");
  clockBtn.title = "Sent friend requests";
  clockBtn.style.border = "none";
  clockBtn.style.background = "transparent";
  clockBtn.style.color = "white";
  clockBtn.style.cursor = "pointer";
  clockBtn.style.padding = "6px 8px";
  clockBtn.style.fontSize = "1.1rem";
  clockBtn.style.display = "flex";
  clockBtn.style.alignItems = "center";
  clockBtn.style.justifyContent = "center";
  // Clock glyph
  clockBtn.innerHTML = "&#128337;"; // 🕘
  buttonContainer.appendChild(clockBtn);

  // Magnifier button on the opposite side of the title
  const magnifierBtn = document.createElement("button");
  magnifierBtn.type = "button";
  magnifierBtn.id = "friends-search-toggle-btn";
  magnifierBtn.setAttribute("aria-expanded", "false");
  magnifierBtn.title = "Search friends";
  magnifierBtn.style.border = "none";
  magnifierBtn.style.background = "transparent";
  magnifierBtn.style.color = "white";
  magnifierBtn.style.cursor = "pointer";
  magnifierBtn.style.padding = "6px 8px";
  magnifierBtn.style.marginRight = "6px";
  magnifierBtn.style.fontSize = "1.1rem";
  magnifierBtn.style.display = "flex";
  magnifierBtn.style.alignItems = "center";
  magnifierBtn.style.justifyContent = "center";
  // Simple magnifier glyph (keeps dependencies minimal)
  magnifierBtn.innerHTML = "&#128269;";
  buttonContainer.appendChild(magnifierBtn);

  header.appendChild(buttonContainer);

  sidebar.appendChild(header);

  // Pending requests container (shows incoming requests at top)
  const pendingContainer = document.createElement("div");
  pendingContainer.id = "friends-pending-requests";
  pendingContainer.style.margin = "6px 8px";
  pendingContainer.style.display = "flex";
  pendingContainer.style.flexDirection = "column";
  pendingContainer.style.rowGap = "6px";
  sidebar.appendChild(pendingContainer);

  // Search container (hidden by default) that opens under the header when magnifier is clicked
  const searchContainer = document.createElement("div");
  searchContainer.id = "friends-search-container";
  searchContainer.style.display = "none";
  searchContainer.style.margin = "8px 8px 12px 8px";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.id = "friends-search-input";
  searchInput.placeholder = "Search friends...";
  searchInput.style.width = "100%";
  searchInput.style.padding = "8px";
  searchInput.style.borderRadius = "6px";
  searchInput.style.border = "1px solid rgba(255,255,255,0.12)";
  searchInput.style.background = "rgba(255,255,255,0.04)";
  searchInput.style.color = "white";
  searchInput.style.outline = "none";
  searchInput.style.boxSizing = "border-box";

  searchContainer.appendChild(searchInput);
  // Results container (will hold search results)
  const resultsContainer = document.createElement("div");
  resultsContainer.id = "friends-search-results";
  resultsContainer.style.marginTop = "8px";
  searchContainer.appendChild(resultsContainer);
  sidebar.appendChild(searchContainer);

  // Sent requests container (hidden by default) that opens when clock icon is clicked
  const sentRequestsContainer = document.createElement("div");
  sentRequestsContainer.id = "friends-sent-requests-container";
  sentRequestsContainer.style.display = "none";
  sentRequestsContainer.style.margin = "8px 8px 12px 8px";
  sentRequestsContainer.style.padding = "10px";
  sentRequestsContainer.style.borderRadius = "8px";
  sentRequestsContainer.style.background = "rgba(255,255,255,0.05)";
  sidebar.appendChild(sentRequestsContainer);

  // Toggle search visibility when magnifier button is clicked
  magnifierBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = searchContainer.style.display !== "none";
    if (isOpen) {
      searchContainer.style.display = "none";
      magnifierBtn.setAttribute("aria-expanded", "false");
    } else {
      // Close sent requests if open
      sentRequestsContainer.style.display = "none";
      clockBtn.setAttribute("aria-expanded", "false");
      
      searchContainer.style.display = "block";
      magnifierBtn.setAttribute("aria-expanded", "true");
      // focus the input for quick typing
      setTimeout(() => searchInput.focus(), 0);
    }
  });

  // Toggle sent requests visibility when clock button is clicked
  clockBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = sentRequestsContainer.style.display !== "none";
    if (isOpen) {
      sentRequestsContainer.style.display = "none";
      clockBtn.setAttribute("aria-expanded", "false");
    } else {
      // Close search if open
      searchContainer.style.display = "none";
      magnifierBtn.setAttribute("aria-expanded", "false");
      
      sentRequestsContainer.style.display = "block";
      clockBtn.setAttribute("aria-expanded", "true");
      // Fetch and display sent requests
      fetchSentRequests();
    }
  });

  // Fetch and render pending friend requests for current user
  async function fetchPendingRequests() {
    try {
      const res = await fetch(
        `${API_CONFIG.USER_SERVICE_URL}/friends/requests`,
        { credentials: "include" }
      );
      if (!res.ok) {
        pendingContainer.innerHTML = "";
        return;
      }
      const data = await res.json();
      renderPendingRequests(data.requests || []);
    } catch (err) {
      pendingContainer.innerHTML = "";
    }
  }

  function renderPendingRequests(requests) {
    pendingContainer.innerHTML = "";
    if (!requests || requests.length === 0) return;
    const titleRow = document.createElement("div");
    titleRow.textContent = "Requests";
    titleRow.style.color = "white";
    titleRow.style.fontWeight = "600";
    titleRow.style.marginBottom = "6px";
    pendingContainer.appendChild(titleRow);

    requests.forEach((r) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "6px";
      row.style.background = "rgba(255,255,255,0.02)";

      const name = document.createElement("div");
      name.textContent = r.from_username || "unknown";
      name.style.color = "white";
      name.style.flex = "1";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";

      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.innerHTML = "&#10003;"; // check mark
      acceptBtn.title = "Accept";
      acceptBtn.style.border = "none";
      acceptBtn.style.background = "rgba(0,128,0,0.85)";
      acceptBtn.style.color = "white";
      acceptBtn.style.padding = "6px 8px";
      acceptBtn.style.borderRadius = "6px";
      acceptBtn.style.cursor = "pointer";

      const declineBtn = document.createElement("button");
      declineBtn.type = "button";
      declineBtn.innerHTML = "&#10005;"; // X mark
      declineBtn.title = "Decline";
      declineBtn.style.border = "none";
      declineBtn.style.background = "rgba(220,20,60,0.9)";
      declineBtn.style.color = "white";
      declineBtn.style.padding = "6px 8px";
      declineBtn.style.borderRadius = "6px";
      declineBtn.style.cursor = "pointer";

      acceptBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        acceptBtn.disabled = true;
        try {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/accept/${r.id}`,
            { method: "POST", credentials: "include" }
          );
          if (res.ok) {
            fetchPendingRequests();
            try {
              fetchFriendsList();
            } catch (e) {}
          } else acceptBtn.disabled = false;
        } catch (err) {
          acceptBtn.disabled = false;
        }
      });

      declineBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        declineBtn.disabled = true;
        try {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/decline/${r.id}`,
            { method: "POST", credentials: "include" }
          );
          if (res.ok) fetchPendingRequests();
          else declineBtn.disabled = false;
        } catch (err) {
          declineBtn.disabled = false;
        }
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(declineBtn);
      row.appendChild(name);
      row.appendChild(actions);
      pendingContainer.appendChild(row);
    });
  }

  // Fetch and render sent pending friend requests (outgoing requests from current user)
  async function fetchSentRequests() {
    try {
      const res = await fetch(
        `${API_CONFIG.USER_SERVICE_URL}/friends/requests/sent`,
        { credentials: "include" }
      );
      if (!res.ok) {
        renderSentRequests([]);
        return;
      }
      const data = await res.json();
      renderSentRequests(data.requests || []);
    } catch (err) {
      renderSentRequests([]);
    }
  }

  function renderSentRequests(requests) {
    sentRequestsContainer.innerHTML = "";
    
    const titleRow = document.createElement("div");
    titleRow.textContent = "Sent Friend Requests";
    titleRow.style.color = "white";
    titleRow.style.fontWeight = "600";
    titleRow.style.marginBottom = "10px";
    titleRow.style.fontSize = "1rem";
    sentRequestsContainer.appendChild(titleRow);

    if (!requests || requests.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.textContent = "No pending sent requests";
      emptyMsg.style.color = "rgba(255,255,255,0.6)";
      emptyMsg.style.fontSize = "0.9rem";
      emptyMsg.style.textAlign = "center";
      emptyMsg.style.padding = "10px 0";
      sentRequestsContainer.appendChild(emptyMsg);
      return;
    }

    const listContainer = document.createElement("div");
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.gap = "6px";

    requests.forEach((r) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 10px";
      row.style.borderRadius = "6px";
      row.style.background = "rgba(255,255,255,0.08)";

      const name = document.createElement("div");
      name.textContent = r.to_username || "Unknown user";
      name.style.color = "white";
      name.style.flex = "1";
      name.style.fontSize = "0.95rem";

      const statusBadge = document.createElement("span");
      statusBadge.textContent = "Pending";
      statusBadge.style.fontSize = "0.75rem";
      statusBadge.style.padding = "4px 8px";
      statusBadge.style.borderRadius = "4px";
      statusBadge.style.background = "rgba(255, 193, 7, 0.2)";
      statusBadge.style.color = "#ffc107";
      statusBadge.style.fontWeight = "500";

      row.appendChild(name);
      row.appendChild(statusBadge);
      listContainer.appendChild(row);
    });

    sentRequestsContainer.appendChild(listContainer);
  }

  // Presence map to keep last-known status across re-renders
  const presenceStatus = new Map(); // friendId -> 'Online' | 'Offline'
  // Store ignored (auto-dismissed) notifications
  const ignoredNotifications = [];
  // Cache current user's profile so we can exclude them from search results
  let currentUser = null;

  // Render friends list into the main content area
  function renderFriends(friends) {
    content.innerHTML = "";
    if (!friends || friends.length === 0) {
      content.innerHTML = '<p style="opacity:0.8;">No friends to show.</p>';
      return;
    }
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.rowGap = "6px";

    friends.forEach((f) => {
      const row = document.createElement("div");
      row.dataset.friendId = String(f.id || "");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "6px";
      row.style.background = "rgba(255,255,255,0.02)";
      row.style.position = "relative";
      // Avatar or placeholder (render a small circle)
      let avatar;
      if (f.avatar) {
        avatar = document.createElement("div");
        avatar.style.width = "28px";
        avatar.style.height = "28px";
        avatar.style.borderRadius = "50%";
        avatar.style.position = "relative";
        avatar.style.backgroundImage = `url(${f.avatar})`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
      } else {
        avatar = document.createElement("div");
        avatar.className = "avatar-placeholder"; // will render 👤 via CSS
        avatar.style.width = "28px";
        avatar.style.height = "28px";
        avatar.style.borderRadius = "50%";
        avatar.style.margin = "0";
        avatar.style.fontSize = "1.1rem";
        avatar.style.display = "flex";
        avatar.style.alignItems = "center";
        avatar.style.justifyContent = "center";
        avatar.style.background = "rgba(255,255,255,0.15)";
        avatar.style.position = "relative";
      }
      avatar.setAttribute("data-friend-avatar", "true");
      row.appendChild(avatar);

      // Status badge (default to offline grey until we have per-friend status data)
      const badge = document.createElement("span");
      badge.style.position = "absolute";
      badge.style.width = "10px";
      badge.style.height = "10px";
      badge.style.borderRadius = "50%";
      badge.style.right = "0px";
      badge.style.bottom = "0px";
      badge.style.border = "2px solid rgba(0,0,0,0.2)";
      const known = presenceStatus.get(f.id);
      const isOnline =
        typeof known === "string"
          ? known.toLowerCase() === "online"
          : typeof f.status === "string" && f.status.toLowerCase() === "online";
      badge.style.background = isOnline ? "#2ecc71" : "#9e9e9e";
      avatar.appendChild(badge);

      const name = document.createElement("div");
      name.textContent = f.username || `User #${f.id}`;
      name.style.color = "white";
      name.style.flex = "1";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      row.appendChild(name);

      // Actions: "..." menu button
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.textContent = "...";
      menuBtn.title = "More";
      menuBtn.style.border = "none";
      menuBtn.style.background = "rgba(255,255,255,0.08)";
      menuBtn.style.color = "white";
      menuBtn.style.padding = "4px 8px";
      menuBtn.style.borderRadius = "6px";
      menuBtn.style.cursor = "pointer";
      row.appendChild(menuBtn);

      // Dropdown for menu
      const dropdown = document.createElement("div");
      dropdown.style.position = "absolute";
      dropdown.style.top = "36px";
      dropdown.style.right = "8px";
      dropdown.style.minWidth = "140px";
      dropdown.style.background = "rgba(30,30,30,0.96)";
      dropdown.style.border = "1px solid rgba(255,255,255,0.12)";
      dropdown.style.borderRadius = "8px";
      dropdown.style.boxShadow = "0 6px 18px rgba(0,0,0,0.45)";
      dropdown.style.padding = "6px";
      dropdown.style.display = "none";
      dropdown.style.zIndex = "10";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove friend";
      removeBtn.style.width = "100%";
      removeBtn.style.textAlign = "left";
      removeBtn.style.border = "none";
      removeBtn.style.background = "transparent";
      // Make remove appear destructive (red)
      removeBtn.style.color = "rgba(220,20,60,0.95)";
      removeBtn.style.padding = "6px 8px";
      removeBtn.style.borderRadius = "6px";
      removeBtn.style.cursor = "pointer";
      removeBtn.addEventListener("mouseover", () => {
        removeBtn.style.background = "rgba(220,20,60,0.15)";
      });
      removeBtn.addEventListener("mouseout", () => {
        removeBtn.style.background = "transparent";
      });

      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Ask for confirmation before removing
        const uname = f.username || `User #${f.id}`;
        showConfirmRemove(uname, async () => {
          removeBtn.disabled = true;
          try {
            const res = await fetch(
              `${API_CONFIG.USER_SERVICE_URL}/friends/remove/${f.id}`,
              { method: "POST", credentials: "include" }
            );
            if (res.ok) {
              dropdown.style.display = "none";
              // Optimistically remove row, then refresh list
              try {
                row.remove();
              } catch (_) {}
              fetchFriendsList();
            } else {
              removeBtn.disabled = false;
            }
          } catch (err) {
            removeBtn.disabled = false;
          }
        });
      });

      // Stats button
      const statsBtn = document.createElement("button");
      statsBtn.type = "button";
      statsBtn.textContent = "Stats";
      statsBtn.style.width = "100%";
      statsBtn.style.textAlign = "left";
      statsBtn.style.border = "none";
      statsBtn.style.background = "transparent";
      statsBtn.style.color = "white";
      statsBtn.style.padding = "6px 8px";
      statsBtn.style.borderRadius = "6px";
      statsBtn.style.cursor = "pointer";
      statsBtn.addEventListener("mouseover", () => {
        statsBtn.style.background = "rgba(255,255,255,0.08)";
      });
      statsBtn.addEventListener("mouseout", () => {
        statsBtn.style.background = "transparent";
      });
      statsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Open friend's profile in the same SPA route using query param
        try {
          history.pushState(null, "", `/profile?userId=${f.id}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = `/profile?userId=${f.id}`;
        }
      });

      // Challenge button
      const challengeBtn = document.createElement("button");
      challengeBtn.type = "button";
      challengeBtn.textContent = "Challenge";
      challengeBtn.style.width = "100%";
      challengeBtn.style.textAlign = "left";
      challengeBtn.style.border = "none";
      challengeBtn.style.background = "transparent";
      challengeBtn.style.color = "white";
      challengeBtn.style.padding = "6px 8px";
      challengeBtn.style.borderRadius = "6px";
      challengeBtn.style.cursor = "pointer";
      challengeBtn.addEventListener("mouseover", () => {
        challengeBtn.style.background = "rgba(255,255,255,0.08)";
      });
      challengeBtn.addEventListener("mouseout", () => {
        challengeBtn.style.background = "transparent";
      });
      challengeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        challengeBtn.disabled = true;
        try {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/challenge/${f.id}`,
            { method: "POST", credentials: "include" }
          );
          // Close dropdown regardless of outcome; recipient will get SSE
          dropdown.style.display = "none";
        } catch {
        } finally {
          challengeBtn.disabled = false;
        }
      });

      // Chat button (added to mirror 'again' project - opens chat window)
      const chatBtn = document.createElement("button");
      chatBtn.type = "button";
      chatBtn.textContent = "Chat";
      chatBtn.style.width = "100%";
      chatBtn.style.textAlign = "left";
      chatBtn.style.border = "none";
      chatBtn.style.background = "transparent";
      chatBtn.style.color = "white";
      chatBtn.style.padding = "6px 8px";
      chatBtn.style.borderRadius = "6px";
      chatBtn.style.cursor = "pointer";
      chatBtn.addEventListener("mouseover", () => {
        chatBtn.style.background = "rgba(255,255,255,0.08)";
      });
      chatBtn.addEventListener("mouseout", () => {
        chatBtn.style.background = "transparent";
      });
      chatBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        dropdown.style.display = "none";
        // Import and open chat window
        try {
          const { openChatWindow } = await import("./chat.js");
          openChatWindow(f.id, f.username || `User ${f.id}`);
        } catch (err) {
          console.error("Failed to open chat:", err);
        }
      });

      dropdown.appendChild(chatBtn);
      dropdown.appendChild(statsBtn);
      dropdown.appendChild(challengeBtn);
      dropdown.appendChild(removeBtn);
      row.appendChild(dropdown);

      // Toggle dropdown
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close any other open dropdowns first
        document
          .querySelectorAll('#friends-sidebar [data-fs-dropdown-open="true"]')
          .forEach((el) => {
            el.style.display = "none";
            el.removeAttribute("data-fs-dropdown-open");
          });
        if (dropdown.style.display === "none") {
          dropdown.style.display = "block";
          dropdown.setAttribute("data-fs-dropdown-open", "true");
        } else {
          dropdown.style.display = "none";
          dropdown.removeAttribute("data-fs-dropdown-open");
        }
      });

      // Clicking outside closes dropdown
      document.addEventListener("click", (evt) => {
        if (!row.contains(evt.target)) {
          dropdown.style.display = "none";
          dropdown.removeAttribute("data-fs-dropdown-open");
        }
      });

      list.appendChild(row);
    });

    content.appendChild(list);
  }

  // Fetch friends list from the server and render
  async function fetchFriendsList() {
    try {
      const res = await fetch(`${API_CONFIG.USER_SERVICE_URL}/friends/list`, {
        credentials: "include",
      });
      if (!res.ok) {
        renderFriends([]);
        return;
      }
      const data = await res.json();
      renderFriends(data.friends || []);
    } catch (e) {
      renderFriends([]);
    }
  }

  // Helper: debounce
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Render search results
  function renderResults(users) {
    resultsContainer.innerHTML = "";
    if (!users || users.length === 0) {
      resultsContainer.innerHTML =
        '<div style="opacity:0.8;color:white;">No users found.</div>';
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.rowGap = "6px";

    users.forEach((u) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "6px";
      row.style.background = "rgba(255,255,255,0.02)";

      const name = document.createElement("div");
      name.textContent = u.username || u.name || "unknown";
      name.style.color = "white";
      name.style.flex = "1";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "Add";
      addBtn.style.marginLeft = "8px";
      addBtn.style.border = "none";
      addBtn.style.background = "rgba(0,128,0,0.8)";
      addBtn.style.color = "white";
      addBtn.style.padding = "6px 8px";
      addBtn.style.borderRadius = "6px";
      addBtn.style.cursor = "pointer";

      addBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        addBtn.disabled = true;
        addBtn.textContent = "Requested";
        // Try to send a friend request to user-service if endpoint exists
        try {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/request/${u.id}`,
            {
              method: "POST",
              credentials: "include",
            }
          );
          if (!res.ok) {
            // If endpoint doesn't exist or fails, just show requested state briefly then revert
            setTimeout(() => {
              addBtn.disabled = false;
              addBtn.textContent = "Add";
              // optionally show visual feedback
            }, 1500);
          }
        } catch (err) {
          // network error or endpoint missing — revert visual state after short delay
          setTimeout(() => {
            addBtn.disabled = false;
            addBtn.textContent = "Add";
          }, 1500);
        }
      });

      row.appendChild(name);
      row.appendChild(addBtn);
      list.appendChild(row);
    });

    resultsContainer.appendChild(list);
  }

  // Perform search query against auth service
  async function performSearch(query) {
    if (!query || query.trim().length === 0) {
      renderResults([]);
      return;
    }

    try {
      // Ensure we know current user's id to filter them out
      if (!currentUser) {
        try {
          const meRes = await fetch(`${API_CONFIG.USER_SERVICE_URL}/profile`, {
            credentials: "include",
          });
          if (meRes.ok) currentUser = await meRes.json();
        } catch (e) {
          // ignore — proceed without filtering if we can't fetch current user
        }
      }

      // Fetch current friends list to filter them out
      let friendIds = [];
      try {
        const friendsRes = await fetch(`${API_CONFIG.USER_SERVICE_URL}/friends/list`, {
          credentials: "include",
        });
        if (friendsRes.ok) {
          const friendsData = await friendsRes.json();
          const friends = friendsData.friends || [];
          friendIds = friends.map(f => f.id).filter(id => id != null);
        }
      } catch (e) {
        // ignore — proceed without filtering friends if we can't fetch the list
      }

      const resp = await fetch(
        `${API_CONFIG.AUTH_SERVICE_URL}/users/search?username=${encodeURIComponent(
          query
        )}`
      );
      if (!resp.ok) {
        renderResults([]);
        return;
      }
      const data = await resp.json();
      // Filter out the current user and existing friends from results
      let users = data.users || [];
      if (currentUser) {
        users = users.filter((u) => {
          // Filter out current user
          if (u.id && currentUser.id && u.id === currentUser.id) return false;
          if (u.username && currentUser.username && u.username === currentUser.username) return false;
          // Filter out existing friends
          if (u.id && friendIds.includes(u.id)) return false;
          return true;
        });
      }
      renderResults(users);
    } catch (err) {
      renderResults([]);
    }
  }

  const debouncedSearch = debounce((e) => performSearch(e.target.value), 300);
  searchInput.addEventListener("input", debouncedSearch);

  // Placeholder content (keeps minimal changes)
  // Friends list container
  const content = document.createElement("div");
  content.id = "friends-sidebar-content";
  content.style.color = "white";
  content.style.padding = "4px 8px 20px 8px";
  sidebar.appendChild(content);

  document.body.appendChild(sidebar);

  // Create toggle button
  const btn = document.createElement("button");
  btn.id = "friends-toggle-btn";
  btn.type = "button";
  btn.textContent = "<";
  btn.setAttribute("aria-expanded", "false");
  btn.style.position = "fixed";
  btn.style.right = "5px";
  btn.style.top = "50%";
  btn.style.transform = "translateY(-50%)";
  btn.style.width = btnWidth;
  btn.style.height = btnHeight;
  btn.style.border = "none";
  btn.style.borderRadius = "8px 8px 8px 8px";
  btn.style.background = "rgba(50, 86, 248, 0.9)";
  btn.style.color = "white";
  btn.style.cursor = "pointer";
  btn.style.zIndex = "10000";
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.fontSize = "1rem";
  btn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.8)";
  btn.style.padding = "0";
  // Smoothly slide the button when the sidebar opens/closes
  btn.style.transition = "right 0.25s ease-in-out";

  document.body.appendChild(btn);

  let open = false;

  function openSidebar() {
    sidebar.style.right = "0";
    sidebar.setAttribute("aria-hidden", "false");
    btn.textContent = ">";
    btn.setAttribute("aria-expanded", "true");
    // Place the toggle button 5px to the left of the opened sidebar
    btn.style.right = `calc(${sidebarWidth} + 5px)`;
    open = true;
    // Load pending requests when opening
    try {
      fetchPendingRequests();
    } catch (e) {}
    try {
      fetchFriendsList();
    } catch (e) {}
  }

  function closeSidebar() {
    sidebar.style.right = `calc(-1 * ${sidebarWidth})`;
    sidebar.setAttribute("aria-hidden", "true");
    btn.textContent = "<";
    btn.setAttribute("aria-expanded", "false");
    // Return the toggle button to its original position when closed
    btn.style.right = "5px";
    open = false;
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!open) openSidebar();
    else closeSidebar();
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!open) return;
    const target = e.target;
    if (target === btn || sidebar.contains(target)) return;
    closeSidebar();
  });

  // Setup Server-Sent Events connection to receive real-time friend notifications
  try {
    const es = new EventSource(
      `${API_CONFIG.USER_SERVICE_URL}/friends/stream`,
      { withCredentials: true }
    );
    console.log("[friendsSidebar] SSE: connecting to /friends/stream");
    es.addEventListener("friend_request", (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        console.log(
          "[friendsSidebar] SSE event friend_request received:",
          data
        );
        // Refresh pending requests so the new request appears at the top
        fetchPendingRequests();
      } catch (e) {
        console.error("[friendsSidebar] SSE parse error", e);
      }
    });
    es.addEventListener("presence", (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        const friendId = data && data.id;
        const status = (data && data.status) || "Offline";
        if (!friendId) return;
        presenceStatus.set(friendId, status);
        const row = sidebar.querySelector(`[data-friend-id="${friendId}"]`);
        if (!row) return;
        const avatar = row.querySelector('[data-friend-avatar="true"]');
        if (!avatar) return;
        const badge = avatar.querySelector("span");
        if (!badge) return;
        badge.style.background =
          String(status).toLowerCase() === "online" ? "#2ecc71" : "#9e9e9e";
      } catch (e) {
        console.warn("[friendsSidebar] presence event parse/update failed", e);
      }
    });
    // Challenge notification
    es.addEventListener("challenge", (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        showChallengeNotification(data);
      } catch (e) {}
    });
    // Navigate both users to Online page when lobby key is issued
    es.addEventListener("go_online", async (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        const lobbyKey = data && data.lobbyKey;
        if (!lobbyKey) return;
        try {
          history.pushState(
            null,
            "",
            `/online?lobby=${encodeURIComponent(lobbyKey)}`
          );
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = `/online?lobby=${encodeURIComponent(
            lobbyKey
          )}`;
        }
        try {
          await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ lobbyKey }),
          });
        } catch {}

        // Update OnlineGame instance with lobby key and fetch lobby info
        try {
          if (
            window.onlineGameInstance &&
            window.onlineGameInstance.setLobbyKey
          ) {
            window.onlineGameInstance.setLobbyKey(lobbyKey);
          }
        } catch {}
      } catch {}
    });
    // Update opponent ready status in online game
    es.addEventListener("ready_update", (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        const { ready } = data;
        if (typeof ready !== "boolean") return;
        // Update the OnlineGame instance if it exists
        if (
          window.onlineGameInstance &&
          window.onlineGameInstance.updateOpponentReady
        ) {
          window.onlineGameInstance.updateOpponentReady(ready);
        }
      } catch (e) {
        console.error("[friendsSidebar] ready_update parse error", e);
      }
    });
    // Navigate both users to online lobby when random match is found
    es.addEventListener("matchmaking_found", async (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        const lobbyKey = data && data.lobbyKey;
        if (!lobbyKey) return;

        // Check if already on online page
        const alreadyOnOnlinePage = window.location.pathname === "/online";

        // Cancel matchmaking state in current instance
        if (window.onlineGameInstance) {
          window.onlineGameInstance.searchingForMatch = false;

          if (alreadyOnOnlinePage) {
            // Update URL without navigation
            history.replaceState(
              null,
              "",
              `/online?lobby=${encodeURIComponent(lobbyKey)}`
            );

            // Update instance with lobby key (this will also fetch lobby info)
            window.onlineGameInstance.setLobbyKey(lobbyKey);

            // Join lobby
            try {
              await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ lobbyKey }),
              });
            } catch {}

            return;
          }
        }

        // Not on online page, navigate normally
        try {
          history.pushState(
            null,
            "",
            `/online?lobby=${encodeURIComponent(lobbyKey)}`
          );
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = `/online?lobby=${encodeURIComponent(
            lobbyKey
          )}`;
        }
        try {
          await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ lobbyKey }),
          });
        } catch {}
      } catch (e) {
        console.error("[friendsSidebar] matchmaking_found parse error", e);
      }
    });
    // Tournament id when both joined; store for later use and attempt immediate join if on Tournament page
    es.addEventListener("tournament", (ev) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        if (data && data.tournamentId) {
          const tid = String(data.tournamentId);
          try {
            sessionStorage.setItem("currentTournamentId", tid);
          } catch {}
          console.log("[friendsSidebar] tournament ready", data);
          // If already on Tournament page and connected, join immediately for robustness
          try {
            const onTournamentPage = window.location.pathname === "/tournament";
            if (
              onTournamentPage &&
              window.tournamentGameInstance &&
              window.tournamentGameInstance.connected &&
              typeof window.joinTournament === "function"
            ) {
              window.joinTournament(tid);
            }
          } catch {}
        }
      } catch {}
    });
    es.addEventListener("open", () => {
      console.log("[friendsSidebar] SSE connection opened");
    });
    es.addEventListener("error", (e) => {
      console.warn("[friendsSidebar] SSE error", e);
      // reconnect handled by browser automatically for EventSource
    });
  } catch (e) {
    console.warn(
      "[friendsSidebar] SSE not available, will fallback to polling when sidebar opens",
      e
    );
  }

  // Polling fallback: if SSE fails or is blocked, fetch pending requests every 8s while sidebar is open
  let pollingInterval = null;
  function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(() => {
      if (open) {
        fetchPendingRequests();
        fetchFriendsList();
      }
    }, 8000);
  }
  function stopPolling() {
    if (!pollingInterval) return;
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  // Start polling when sidebar is opened (in addition to SSE) and stop when closed
  const originalOpenSidebar = openSidebar;
  // wrap openSidebar to start polling
  openSidebar = () => {
    originalOpenSidebar();
    try {
      fetchPendingRequests();
    } catch (e) {}
    startPolling();
  };
  const originalCloseSidebar = closeSidebar;
  closeSidebar = () => {
    originalCloseSidebar();
    stopPolling();
  };

  // ---- Challenge notification UI ----
  function showChallengeNotification(payload) {
    // Calculate top position 5px under navbar if available
    let topPx = 10;
    try {
      const nav = document.querySelector(".navbar");
      if (nav) {
        const rect = nav.getBoundingClientRect();
        topPx = Math.max(0, rect.height) + 5;
      } else {
        topPx = 55;
      }
    } catch {
      topPx = 55;
    }

    const container = document.createElement("div");
    let acted = false; // track if user clicked approve/decline
    container.style.position = "fixed";
    container.style.top = `${topPx}px`;
    container.style.left = "-13cm"; // start off-screen to the left
    container.style.width = "11cm";
    container.style.height = "3cm";
    container.style.background = "rgba(93, 76, 160, 1)";
    container.style.color = "white";
    container.style.border = "1px solid rgba(255,255,255,0.15)";
    container.style.borderRadius = "10px";
    container.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";
    container.style.padding = "0 14px";
    container.style.zIndex = "10001";
    container.style.transition =
      "left 0.35s ease-in-out, opacity 0.25s ease-in-out";
    container.style.opacity = "0.98";

    const title = document.createElement("div");
    const from =
      payload && (payload.from_username || `User #${payload.from_id || ""}`);
    title.textContent = `${from} challenged you to an online match`;
    title.style.fontWeight = "600";
    title.style.fontSize = "0.95rem";
    title.style.letterSpacing = "0.3px";
    title.style.pointerEvents = "none";
    title.style.marginRight = "10px";

    // Actions: approve (✓) and decline (✕)
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.alignItems = "center";
    actions.style.gap = "8px";

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.innerHTML = "&#10003;";
    approveBtn.title = "Accept";
    approveBtn.style.border = "none";
    approveBtn.style.background = "rgba(0,128,0,0.85)";
    approveBtn.style.color = "white";
    approveBtn.style.padding = "8px 12px";
    approveBtn.style.borderRadius = "6px";
    approveBtn.style.cursor = "pointer";
    approveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      acted = true;
      try {
        const fromId = payload && payload.from_id;
        if (fromId != null) {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/challenge/accept/${fromId}`,
            { method: "POST", credentials: "include" }
          );
          const js = res.ok ? await res.json() : null;
          const lobbyKey = js && js.lobbyKey;
          if (lobbyKey) {
            try {
              history.pushState(
                null,
                "",
                `/online?lobby=${encodeURIComponent(lobbyKey)}`
              );
              window.dispatchEvent(new PopStateEvent("popstate"));
            } catch {
              window.location.href = `/online?lobby=${encodeURIComponent(
                lobbyKey
              )}`;
            }
            try {
              await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ lobbyKey }),
              });
            } catch {}
          }
        }
      } finally {
        try {
          container.style.left = "-13cm";
          setTimeout(() => container.remove(), 350);
        } catch {}
      }
    });

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.innerHTML = "&#10005;";
    declineBtn.title = "Decline";
    declineBtn.style.border = "none";
    declineBtn.style.background = "rgba(220,20,60,0.9)";
    declineBtn.style.color = "white";
    declineBtn.style.padding = "8px 12px";
    declineBtn.style.borderRadius = "6px";
    declineBtn.style.cursor = "pointer";
    declineBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      acted = true;
      try {
        container.style.left = "-13cm";
        setTimeout(() => container.remove(), 350);
      } catch {}
    });

    actions.appendChild(approveBtn);
    actions.appendChild(declineBtn);

    container.appendChild(title);
    container.appendChild(actions);

    document.body.appendChild(container);

    // Slide in to 5px from left
    requestAnimationFrame(() => {
      container.style.left = "5px";
    });

    // Auto-hide after 10 seconds with slide out
    setTimeout(() => {
      try {
        container.style.left = "-13cm";
        setTimeout(() => {
          container.remove();
        }, 400);
      } catch {}
      // Record as ignored only if no user action
      if (!acted) {
        try {
          const entry = {
            type: "challenge",
            from_id: payload && payload.from_id,
            from_username: payload && payload.from_username,
            created_at: new Date().toISOString(),
          };
          // Keep only the latest challenge per sender
          if (entry.from_id != null) {
            for (let i = ignoredNotifications.length - 1; i >= 0; i--) {
              if (ignoredNotifications[i].from_id === entry.from_id) {
                ignoredNotifications.splice(i, 1);
              }
            }
          }
          ignoredNotifications.push(entry);
          // If dropdown is open, refresh it
          renderNotificationsList();
        } catch {}
      }
    }, 10000);
  }

  function showConfirmRemove(username, onYes) {
    const t = getTopOffset();
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = `${t + 10}px`;
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.width = "11cm";
    container.style.minHeight = "3cm";
    container.style.background = "rgba(93, 76, 160, 1)";
    container.style.color = "white";
    container.style.border = "1px solid rgba(255,255,255,0.15)";
    container.style.borderRadius = "10px";
    container.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";
    container.style.padding = "0 14px";
    container.style.zIndex = "10002";
    container.style.opacity = "0";
    container.style.transition = "opacity 0.2s ease-in-out";

    const title = document.createElement("div");
    title.textContent = `Are you sure you want to remove ${username} from friends?`;
    title.style.fontWeight = "600";
    title.style.fontSize = "0.95rem";
    title.style.letterSpacing = "0.3px";
    title.style.pointerEvents = "none";
    title.style.marginRight = "10px";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.alignItems = "center";
    actions.style.gap = "8px";

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.textContent = "Yes";
    yesBtn.style.border = "none";
    yesBtn.style.background = "rgba(220,20,60,0.9)";
    yesBtn.style.color = "white";
    yesBtn.style.padding = "8px 12px";
    yesBtn.style.borderRadius = "6px";
    yesBtn.style.cursor = "pointer";
    yesBtn.addEventListener("click", () => {
      try {
        container.remove();
      } catch {}
      try {
        if (typeof onYes === "function") onYes();
      } catch {}
    });

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.textContent = "No";
    noBtn.style.border = "none";
    noBtn.style.background = "rgba(255,255,255,0.2)";
    noBtn.style.color = "white";
    noBtn.style.padding = "8px 12px";
    noBtn.style.borderRadius = "6px";
    noBtn.style.cursor = "pointer";
    noBtn.addEventListener("click", () => {
      try {
        container.remove();
      } catch {}
    });

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    container.appendChild(title);
    container.appendChild(actions);
    document.body.appendChild(container);
    requestAnimationFrame(() => {
      container.style.opacity = "0.98";
    });
  }

  // ---- Notifications button and dropdown ----
  // Calculate a consistent top offset (5px under navbar).
  // Use document-based offset (nav.offsetTop + nav.offsetHeight) so the button
  // is positioned in the page flow and will move up when the user scrolls down.
  function getTopOffset() {
    try {
      const nav = document.querySelector(".navbar");
      if (nav) {
        const top = (nav.offsetTop || 0) + (nav.offsetHeight || 0) + 5;
        return Math.max(0, top);
      }
    } catch {}
    return 55;
  }

  // Create button
  const notifBtn = document.createElement("button");
  notifBtn.textContent = "Notifications";
  notifBtn.className = "btn btn-secondary";
  // position absolute so it scrolls with the page (moves up when user scrolls down)
  notifBtn.style.position = "absolute";
  notifBtn.style.left = "5px";
  notifBtn.style.top = `${getTopOffset()}px`;
  // Keep below the challenge banner (10001) and other overlays
  notifBtn.style.zIndex = "10000";
  notifBtn.style.padding = "8px 12px";
  notifBtn.style.border = "1px solid rgba(255,255,255,0.2)";
  notifBtn.style.borderRadius = "8px";
  notifBtn.style.background = "rgba(255,255,255,0.1)";
  notifBtn.style.color = "white";
  notifBtn.style.backdropFilter = "blur(10px)";
  notifBtn.style.cursor = "pointer";
  document.body.appendChild(notifBtn);

  // Dropdown panel
  const notifPanel = document.createElement("div");
  // keep the panel positioned relative to the document as well
  notifPanel.style.position = "absolute";
  notifPanel.style.left = "5px";
  notifPanel.style.top = `${getTopOffset() + 44}px`;
  notifPanel.style.width = "11cm";
  notifPanel.style.maxHeight = "40vh";
  notifPanel.style.overflow = "auto";
  notifPanel.style.background = "rgba(93, 76, 160, 1)";
  notifPanel.style.color = "white";
  notifPanel.style.border = "1px solid rgba(255,255,255,0.15)";
  notifPanel.style.borderRadius = "10px";
  notifPanel.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
  notifPanel.style.padding = "10px 12px";
  notifPanel.style.zIndex = "10001";
  notifPanel.style.display = "none";
  document.body.appendChild(notifPanel);

  // Ensure the button is always positioned below the navbar, including on fresh load
  function updateNotifPositions() {
    const t = getTopOffset();
    notifBtn.style.top = `${t}px`;
    notifPanel.style.top = `${t + 44}px`;
  }
  // Run immediately and shortly after to account for navbar mounting
  try {
    updateNotifPositions();
  } catch {}
  try {
    setTimeout(updateNotifPositions, 0);
  } catch {}
  try {
    setTimeout(updateNotifPositions, 300);
  } catch {}
  // Keep positions correct on resize and when scrolling
  try {
    window.addEventListener("resize", updateNotifPositions);
    window.addEventListener("scroll", updateNotifPositions);
  } catch {}

  function renderNotificationsList() {
    if (notifPanel.style.display === "none") return; // only render when open
    notifPanel.innerHTML = "";

    // Deduplicate so only the latest challenge per sender is displayed
    const latestBySender = new Map();
    for (const n of ignoredNotifications) {
      const key = n.from_id != null ? n.from_id : `u:${n.from_username || ""}`;
      const prev = latestBySender.get(key);
      if (
        !prev ||
        new Date(n.created_at).getTime() > new Date(prev.created_at).getTime()
      ) {
        latestBySender.set(key, n);
      }
    }
    const items = Array.from(latestBySender.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    if (!items.length) {
      const empty = document.createElement("div");
      empty.textContent = "No notifications";
      empty.style.opacity = "0.9";
      empty.style.width = "5cm";
      notifPanel.appendChild(empty);
      return;
    }

    items.forEach((n) => {
      notifPanel.appendChild(createBannerLikeRow(n));
    });
  }

  // Create a banner-like row for the dropdown matching the live notification style
  function createBannerLikeRow(n) {
    const container = document.createElement("div");
    container.style.position = "relative";
    container.style.width = "100%";
    container.style.minHeight = "3cm";
    container.style.background = "rgba(93, 76, 160, 1)";
    container.style.color = "white";
    container.style.border = "1px solid rgba(255,255,255,0.15)";
    container.style.borderRadius = "10px";
    container.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";
    container.style.padding = "0 14px";
    container.style.marginBottom = "10px";
    container.style.opacity = "0.98";

    const title = document.createElement("div");
    const from = n && (n.from_username || `User #${n.from_id || ""}`);
    title.textContent = `${from} challenged you to an online match`;
    title.style.fontWeight = "600";
    title.style.fontSize = "0.95rem";
    title.style.letterSpacing = "0.3px";
    title.style.pointerEvents = "none";
    title.style.marginRight = "10px";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.alignItems = "center";
    actions.style.gap = "8px";

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.innerHTML = "&#10003;";
    approveBtn.title = "Accept";
    approveBtn.style.border = "none";
    approveBtn.style.background = "rgba(0,128,0,0.85)";
    approveBtn.style.color = "white";
    approveBtn.style.padding = "8px 12px";
    approveBtn.style.borderRadius = "6px";
    approveBtn.style.cursor = "pointer";
    approveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const fromId = n && n.from_id;
        if (fromId != null) {
          const res = await fetch(
            `${API_CONFIG.USER_SERVICE_URL}/friends/challenge/accept/${fromId}`,
            { method: "POST", credentials: "include" }
          );
          const js = res.ok ? await res.json() : null;
          const lobbyKey = js && js.lobbyKey;
          if (lobbyKey) {
            try {
              history.pushState(
                null,
                "",
                `/online?lobby=${encodeURIComponent(lobbyKey)}`
              );
              window.dispatchEvent(new PopStateEvent("popstate"));
            } catch {
              window.location.href = `/online?lobby=${encodeURIComponent(
                lobbyKey
              )}`;
            }
            try {
              await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ lobbyKey }),
              });
            } catch {}
          }
        }
      } finally {
        // Remove from ignored store and refresh panel
        removeIgnoredBySender(n.from_id, n.from_username);
        renderNotificationsList();
      }
    });

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.innerHTML = "&#10005;";
    declineBtn.title = "Decline";
    declineBtn.style.border = "none";
    declineBtn.style.background = "rgba(220,20,60,0.9)";
    declineBtn.style.color = "white";
    declineBtn.style.padding = "8px 12px";
    declineBtn.style.borderRadius = "6px";
    declineBtn.style.cursor = "pointer";
    declineBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Remove from ignored store and refresh panel
      removeIgnoredBySender(n.from_id, n.from_username);
      renderNotificationsList();
    });

    actions.appendChild(approveBtn);
    actions.appendChild(declineBtn);
    container.appendChild(title);
    container.appendChild(actions);
    return container;
  }

  function removeIgnoredBySender(from_id, from_username) {
    const key =
      from_id != null
        ? (x) => x.from_id === from_id
        : (x) => x.from_username === from_username;
    for (let i = ignoredNotifications.length - 1; i >= 0; i--) {
      if (key(ignoredNotifications[i])) ignoredNotifications.splice(i, 1);
    }
  }

  let panelOpen = false;
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    notifPanel.style.display = panelOpen ? "block" : "none";
    if (panelOpen) {
      // Update top positions on open
      const t = getTopOffset();
      notifBtn.style.top = `${t}px`;
      notifPanel.style.top = `${t + 44}px`;
      renderNotificationsList();
    }
  });

  // Close panel on outside click
  document.addEventListener("click", (e) => {
    if (!panelOpen) return;
    const target = e.target;
    if (target === notifBtn || notifPanel.contains(target)) return;
    notifPanel.style.display = "none";
    panelOpen = false;
  });
}

// Keep default export empty for compatibility with existing imports
export default initFriendsSidebar;
