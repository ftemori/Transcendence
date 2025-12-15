import { Navbar } from "../../components/Navbar/index.js";
import { useProfile } from "../../hooks/useProfile.js";
import { useEventListener } from "../../hooks/useEventListener.js";
import { checkAuth } from "../../utils/auth.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { API_CONFIG } from "../../config.js";

export async function ProfilePage() {
  const { getProfileData, changeAvatar, startTwoFactorSetup } = useProfile();
  const { addSingleEventListener } = useEventListener();
  const loggedIn = await checkAuth();
  const { navigateTo } = useNavigation();

  if (!loggedIn?.loggedIn) {
    navigateTo("/login");
    return "";
  }

  // Fetch current user's profile first so we can tell if we're viewing our own or someone else's
  const currentUser = await getProfileData();

  // Detect if viewing another user's profile via ?userId=
  const params = new URLSearchParams(window.location.search);
  const viewIdParam = params.get("userId");
  let viewingOther = false;
  let profile = null;

  if (viewIdParam) {
    const viewId = parseInt(viewIdParam, 10);
    if (!isNaN(viewId) && currentUser && viewId !== currentUser.id) {
      viewingOther = true;
      try {
        const res = await fetch(
          `${API_CONFIG.USER_SERVICE_URL}/profile/${viewId}`,
          { credentials: "include" }
        );
        if (res.ok) {
          profile = await res.json();
        }
      } catch {}
    }
  }

  // If we didn't load another user's profile, show the current user's profile
  if (!profile) {
    profile = currentUser;
  }

  if (!profile) {
    navigateTo("/login");
    return "";
  }

  addSingleEventListener(".change-avatar-btn", "click", changeAvatar);

  // Initialize 2FA button state
  setTimeout(async () => {
    try {
      const res = await fetch(`${API_CONFIG.AUTH_SERVICE_URL}/2fa/status`, {
        credentials: "include",
      });
      const data = await res.json();
      const btn = document.getElementById("btn-start-2fa");
      if (btn) {
        if (res.ok && data.success && data.enabled) {
          // If already enabled, hide button and show message
          const container = document.getElementById("twofa-setup");
          if (container) container.innerHTML = "<p style='margin-bottom: 15px;'>2FA is enabled</p>";
          btn.remove();
        } else {
          btn.textContent = "Enable 2FA";
          btn.addEventListener("click", startTwoFactorSetup);
        }
      }
    } catch {}
  }, 0);

  let matches = [];

  try {
    let res;
    if (viewingOther && profile && profile.id) {
      res = await fetch(
        `${API_CONFIG.USER_SERVICE_URL}/matches/${profile.id}`,
        { credentials: "include" }
      );
    } else {
      res = await fetch(`${API_CONFIG.USER_SERVICE_URL}/matches/me`, {
        credentials: "include",
      });
    }

    const data = await res.json();
    if (res.ok && data.matches) {
      matches = data.matches;
    }
  } catch (err) {
    console.error("Failed to fetch match history:", err);
  }
  const matchHistoryHTML = matches.length
    ? `<ul class="match-list">
        ${matches
          .map(
            (match) => `
          <li class="match-item">
            <strong>${match.played_at}</strong>:
            ${match.player1_username} vs ${match.player2_username} —
            Score: ${match.player1_score} vs ${match.player2_score}
          </li>
        `
          )
          .join("")}
      </ul>`
    : "<p>No matches found.</p>";
  // <p>Email: ${profile.email}</p>
  let wins = 0;
  let losses = 0;
  let ties = 0;

  const profileId = Number(profile.id);

  for (const match of matches) {
    const p1 = Number(match.player1_id);
    const p2 = Number(match.player2_id);

    if (p1 === profileId) {
      if (match.player1_score > match.player2_score) wins++;
      else if (match.player1_score < match.player2_score) losses++;
      else ties++;
    } else if (p2 === profileId) {
      if (match.player2_score > match.player1_score) wins++;
      else if (match.player2_score < match.player1_score) losses++;
      else ties++;
    }
  }

  const isOnline = String(profile.status || "").toLowerCase() === "online";
  const statusColor = isOnline ? "#2ecc71" : "#9e9e9e";
  // Title: "My Profile" when viewing own profile, otherwise "<username>'s Profile"
  const title =
    !viewingOther || (currentUser && profile && currentUser.id === profile.id)
      ? "My Profile"
      : `${profile.username}'s Profile`;

  return `
    ${Navbar(loggedIn)}
    <div class="main-content">
      <div class="profile-container">
        <h1>${title}</h1>
        <div class="profile-info">
          <div class="avatar-section">
            <div class="avatar-placeholder" style="${
              profile.avatar
                ? `background-image: url(${profile.avatar}); background-size: cover;`
                : ""
            } position: relative;">
              <span style="position: absolute; width: 20px; height: 20px; border-radius: 50%; background: ${statusColor}; right: 7px; bottom: 7px; border: 2px solid rgba(0,0,0,0.2);"></span>
            </div>
          </div>
          <div class="user-details">
            <h2>${profile.username}</h2>
            <p>Registration Date: ${profile.registrationDate}</p>
            <p>Status: ${profile.status}</p>
          </div>
        </div>
        <div class="stats-section">
          <h3>Game Statistics</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <h4>Total Games</h4>
              <div class="stat-number">${matches.length}</div>
            </div>
            <div class="stat-card">
              <h4>Wins</h4>
              <div class="stat-number">${wins}</div>
            </div>
            <div class="stat-card">
              <h4>Losses</h4>
              <div class="stat-number">${losses}</div>
            </div>
            <div class="stat-card">
              <h4>Ties</h4>
              <div class="stat-number">${ties}</div>
            </div>
          </div>
        </div>
        <div class="match-history">
          <h3>Match History</h3>
          ${matchHistoryHTML}
        </div>
      </div>
    </div>
  `;
}
