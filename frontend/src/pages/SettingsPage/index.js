import { Navbar } from "../../components/Navbar/index.js";
import { useProfile } from "../../hooks/useProfile.js";
import { useEventListener } from "../../hooks/useEventListener.js";
import { checkAuth } from "../../utils/auth.js";
import { fetchWithLoader } from "../../utils/fetchWithLoader.js";
import { API_CONFIG } from "../../config.js";

export async function SettingsPage() {
  const {
    getProfileData,
    changeAvatar,
    startTwoFactorSetup,
    changeUsername,
    changePassword,
  } = useProfile();
  const { addSingleEventListener } = useEventListener();
  const loggedIn = await checkAuth();
  const profile = await getProfileData();

  addSingleEventListener(".change-avatar-btn", "click", changeAvatar);

  // Username change functionality
  const handleUsernameChange = async () => {
    const container = document.getElementById("username-change-container");
    const input = document.getElementById("new-username");
    const messageBox = document.getElementById("username-message");
    const oldUsername = document.querySelector(".user-username").textContent;

    if (!input.value.trim()) {
      messageBox.textContent = "Please enter a username";
      messageBox.className = "error-message";
      messageBox.style.display = "block";
      return;
    }

    const newUsername = input.value.trim();

    // Show loading message
    messageBox.textContent = "Updating username...";
    messageBox.className = "info-message";
    messageBox.style.display = "block";

    const result = await changeUsername(newUsername);
    messageBox.textContent = result.message;
    messageBox.className = result.success ? "success-message" : "error-message";
    messageBox.style.display = "block";

    if (result.success) {
      // Update displayed username everywhere it appears
      document.querySelector(".user-username").textContent = newUsername;

      // Hide the input container after success
      setTimeout(() => {
        container.style.display = "none";
        input.value = "";
        messageBox.style.display = "none";
      }, 2000);
    }
  };

  // Handle password change
  const handlePasswordChange = async () => {
    const container = document.getElementById("password-change-container");
    const newPassInput = document.getElementById("new-password");
    const confirmPassInput = document.getElementById("confirm-password");
    const verificationInput = document.getElementById("verification-input");
    const messageBox = document.getElementById("password-message");

    if (
      !newPassInput.value ||
      !confirmPassInput.value ||
      !verificationInput.value
    ) {
      messageBox.textContent = "Please fill in all fields";
      messageBox.className = "error-message";
      messageBox.style.display = "block";
      return;
    }

    // Show loading message
    messageBox.textContent = "Updating password...";
    messageBox.className = "info-message";
    messageBox.style.display = "block";

    const result = await changePassword(
      newPassInput.value,
      confirmPassInput.value,
      verificationInput.value
    );

    messageBox.textContent = result.message;
    messageBox.className = result.success ? "success-message" : "error-message";
    messageBox.style.display = "block";

    if (result.success) {
      // Clear inputs and hide container after success
      setTimeout(() => {
        container.style.display = "none";
        newPassInput.value = "";
        confirmPassInput.value = "";
        verificationInput.value = "";
        messageBox.style.display = "none";
      }, 2000);
    }
  };

  // Add event listeners
  setTimeout(() => {
    const changeUsernameBtn = document.getElementById("change-username-btn");
    const usernameDoneBtn = document.getElementById("username-done-btn");
    const usernameContainer = document.getElementById(
      "username-change-container"
    );

    const changePasswordBtn = document.getElementById("change-password-btn");
    const passwordDoneBtn = document.getElementById("password-done-btn");
    const passwordContainer = document.getElementById(
      "password-change-container"
    );

    if (changeUsernameBtn) {
      changeUsernameBtn.addEventListener("click", () => {
        usernameContainer.style.display = "block";
        passwordContainer.style.display = "none";
      });
    }

    if (usernameDoneBtn) {
      usernameDoneBtn.addEventListener("click", handleUsernameChange);
    }

    if (changePasswordBtn) {
      changePasswordBtn.addEventListener("click", async () => {
        passwordContainer.style.display = "block";
        usernameContainer.style.display = "none";

        // Check 2FA status and update verification field label
        const res = await fetchWithLoader(
          `${API_CONFIG.AUTH_SERVICE_URL}/2fa/status`,
          { credentials: "include" }
        );
        const data = await res.json();
        const label = document.getElementById("verification-label");
        const verificationInput = document.getElementById("verification-input");
        if (label && verificationInput) {
          const is2FAEnabled = data.success && data.enabled;
          label.textContent = is2FAEnabled
            ? "Enter your 2FA code:"
            : "Enter your current password:";
          verificationInput.type = is2FAEnabled ? "text" : "password";
          verificationInput.placeholder = is2FAEnabled
            ? "Enter 2FA code"
            : "Enter current password";
        }
      });
    }

    if (passwordDoneBtn) {
      passwordDoneBtn.addEventListener("click", handlePasswordChange);
    }
  }, 0);

  // Initialize 2FA button state
  setTimeout(async () => {
    try {
      const res = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/2fa/status`,
        { credentials: "include" }
      );
      const data = await res.json();
      const enableBtn = document.getElementById("btn-start-2fa");
      const disableBtn = document.getElementById("btn-disable-2fa");
      const container = document.getElementById("twofa-setup");

      if (res.ok && data.success && data.enabled) {
        // 2FA is enabled - show disable button, hide enable button
        if (enableBtn) enableBtn.style.display = "none";
        if (disableBtn) disableBtn.style.display = "inline-block";
        if (container) container.innerHTML = "<p style='color: #28a745; font-weight: 600; margin-bottom: 15px;'>✓ 2FA is enabled</p>";
      } else {
        // 2FA is disabled - show enable button, hide disable button
        if (enableBtn) {
          enableBtn.style.display = "inline-block";
          enableBtn.textContent = "Enable 2FA";
          enableBtn.addEventListener("click", startTwoFactorSetup);
        }
        if (disableBtn) disableBtn.style.display = "none";
        if (container) container.innerHTML = "";
      }
    } catch (e) {
      // optionally handle error UI
    }
  }, 0);

  // Disable 2FA functionality
  setTimeout(() => {
    const disableBtn = document.getElementById("btn-disable-2fa");
    const modal = document.getElementById("disable-2fa-modal");
    const confirmBtn = document.getElementById("confirm-disable-2fa");
    const cancelBtn = document.getElementById("cancel-disable-2fa");
    const otpInput = document.getElementById("disable-2fa-otp");
    const messageBox = document.getElementById("disable-2fa-message");

    if (disableBtn && modal && confirmBtn && cancelBtn && otpInput) {
      // Show modal when disable button is clicked
      disableBtn.addEventListener("click", () => {
        modal.style.display = "flex";
        otpInput.value = "";
        if (messageBox) messageBox.style.display = "none";
      });

      // Close modal when cancel is clicked
      cancelBtn.addEventListener("click", () => {
        modal.style.display = "none";
        otpInput.value = "";
        if (messageBox) messageBox.style.display = "none";
      });

      // Handle 2FA disable when confirm is clicked
      confirmBtn.addEventListener("click", async () => {
        const otpCode = otpInput.value.trim();

        if (!otpCode) {
          if (messageBox) {
            messageBox.textContent = "Please enter your 2FA code";
            messageBox.className = "error-message";
            messageBox.style.display = "block";
          }
          return;
        }

        try {
          const response = await fetchWithLoader(
            `${API_CONFIG.AUTH_SERVICE_URL}/2fa/disable`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: otpCode })
            }
          );

          const result = await response.json();

          if (response.ok && result.success) {
            // 2FA disabled successfully
            modal.style.display = "none";
            otpInput.value = "";

            // Update UI - hide disable button, show enable button
            const enableBtn = document.getElementById("btn-start-2fa");
            const disableBtn = document.getElementById("btn-disable-2fa");
            const container = document.getElementById("twofa-setup");

            if (disableBtn) disableBtn.style.display = "none";
            if (enableBtn) {
              enableBtn.style.display = "inline-block";
              enableBtn.textContent = "Enable 2FA";
            }
            if (container) container.innerHTML = "";
          } else {
            if (messageBox) {
              messageBox.textContent = result.error || "Invalid 2FA code";
              messageBox.className = "error-message";
              messageBox.style.display = "block";
            }
          }
        } catch (error) {
          console.error("Error disabling 2FA:", error);
          if (messageBox) {
            messageBox.textContent = "An error occurred. Please try again.";
            messageBox.className = "error-message";
            messageBox.style.display = "block";
          }
        }
      });
    }
  }, 0);

  // Delete account functionality
  setTimeout(() => {
    const deleteBtn = document.getElementById("btn-delete-account");
    const modal = document.getElementById("delete-account-modal");
    const confirmYes = document.getElementById("confirm-delete-yes");
    const confirmNo = document.getElementById("confirm-delete-no");

    if (deleteBtn && modal && confirmYes && confirmNo) {
      // Show modal when delete button is clicked
      deleteBtn.addEventListener("click", () => {
        modal.style.display = "flex";
      });

      // Close modal when "No" is clicked
      confirmNo.addEventListener("click", () => {
        modal.style.display = "none";
      });

      // Handle account deletion when "Yes" is clicked
      confirmYes.addEventListener("click", async () => {
        try {
          const response = await fetchWithLoader(
            `${API_CONFIG.USER_SERVICE_URL}/users/delete`,
            {
              method: "DELETE",
              credentials: "include",
            }
          );

          if (response.ok) {
            // Account deleted successfully, logout and redirect to login page
            try {
              await fetch(`${API_CONFIG.AUTH_SERVICE_URL}/logout`, {
                method: "POST",
                credentials: "include",
              });
            } catch (logoutError) {
              console.error("Error during logout:", logoutError);
            }
            // Redirect to login page
            window.location.href = "/login";
          } else {
            const data = await response.json();
            alert(`Failed to delete account: ${data.error || "Unknown error"}`);
            modal.style.display = "none";
          }
        } catch (error) {
          console.error("Error deleting account:", error);
          alert("An error occurred while deleting your account. Please try again.");
          modal.style.display = "none";
        }
      });
    }
  }, 0);

  return `
    ${Navbar(loggedIn)}
    <div class="main-content">
      <div class="profile-container">
        <h1>Settings</h1>
        <div class="profile-info">
          <div class="avatar-section">
            <div class="avatar-placeholder" style="${profile.avatar
      ? `background-image: url(${profile.avatar}); background-size: cover;`
      : ""
    }"></div>
            <h2 class="user-username">${profile.username}</h2>
            <button class="btn btn-secondary change-avatar-btn">Change Avatar</button>
            <button class="btn btn-secondary" id="change-username-btn" style="margin-top: 10px;">Change Username</button>
            <button class="btn btn-secondary" id="change-password-btn" style="margin-top: 10px;">Change Password</button>
            <div id="username-change-container" style="display: none;">
              <div class="auth-form" style="margin-top: 15px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); max-width: 400px; padding: 20px;">
                <div class="form-group">
                  <input type="text" id="new-username" placeholder="Enter new username" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 5px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 1rem;">
                </div>
                <button class="btn btn-primary" id="username-done-btn" style="width: 100%; margin-top: 10px;">Done</button>
                <div id="username-message"></div>
              </div>
            </div>
            <div id="password-change-container" style="display: none;">
              <div class="auth-form" style="margin-top: 15px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); max-width: 400px; padding: 20px;">
                <div class="form-group">
                  <input type="password" id="new-password" placeholder="Enter new password" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 5px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 1rem; margin-bottom: 10px;">
                  <input type="password" id="confirm-password" placeholder="Confirm new password" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 5px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 1rem; margin-bottom: 10px;">
                  <label id="verification-label" style="color: white; display: block; margin-bottom: 5px;">Enter verification:</label>
                  <input type="password" id="verification-input" placeholder="Enter current password or 2FA code" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 5px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 1rem;">
                </div>
                <button class="btn btn-primary" id="password-done-btn" style="width: 100%; margin-top: 10px;">Done</button>
                <div id="password-message" class="message"></div>
              </div>
            </div>
            <div style="width: 100%; height: 1px; background: rgba(255, 255, 255, 0.1); margin: 30px 0;"></div>
            <div style="width: 100%; text-align: center;">
              <h3 style="margin-bottom: 15px; color: white;">Security</h3>
              <div id="twofa-setup"></div>
              <button class="btn btn-secondary" id="btn-start-2fa">Enable 2FA</button>
              <button class="btn btn-danger" id="btn-disable-2fa" style="display: none; background: #dc3545; border-color: #dc3545;">Disable 2FA</button>
            </div>
            <div style="width: 100%; height: 1px; background: rgba(255, 255, 255, 0.1); margin: 30px 0;"></div>
            <div style="width: 100%; text-align: center;">
              <h3 style="margin-bottom: 15px; color: white;">Danger Zone</h3>
              <button class="btn btn-danger" id="btn-delete-account" style="background: #dc3545; border-color: #dc3545;">Delete Account</button>
            </div>
          </div>
        </div>
        
        <!-- Delete Account Confirmation Modal -->
        <div id="delete-account-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 10000; justify-content: center; align-items: center;">
          <div style="background: rgba(30, 30, 30, 0.98); backdrop-filter: blur(10px); border: 2px solid rgba(220, 53, 69, 0.5); border-radius: 15px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 10px 40px rgba(220, 53, 69, 0.3);">
            <h2 style="color: #dc3545; margin-bottom: 20px; font-size: 28px;">⚠️ Delete Account</h2>
            <p style="color: white; font-size: 18px; line-height: 1.6; margin-bottom: 30px;">
              By deleting your account all of your data will be lost forever. Do you want to continue?
            </p>
            <div style="display: flex; gap: 20px; justify-content: center;">
              <button id="confirm-delete-yes" class="btn btn-danger" style="background: #dc3545; border-color: #dc3545; padding: 12px 30px; font-size: 16px; font-weight: bold;">Yes</button>
              <button id="confirm-delete-no" class="btn btn-secondary" style="padding: 12px 30px; font-size: 16px; font-weight: bold;">No</button>
            </div>
          </div>
        </div>

        <!-- Disable 2FA Modal -->
        <div id="disable-2fa-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 10000; justify-content: center; align-items: center;">
          <div style="background: rgba(30, 30, 30, 0.98); backdrop-filter: blur(10px); border: 2px solid rgba(102, 126, 234, 0.5); border-radius: 15px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);">
            <h2 style="color: #667eea; margin-bottom: 20px; font-size: 28px;">🔐 Disable 2FA</h2>
            <p style="color: white; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              To disable two-factor authentication, please enter your current 2FA code.
            </p>
            <input type="text" id="disable-2fa-otp" placeholder="Enter 6-digit code" maxlength="6" style="width: 100%; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 18px; text-align: center; letter-spacing: 5px; margin-bottom: 10px;">
            <div id="disable-2fa-message" class="message" style="margin-bottom: 20px;"></div>
            <div style="display: flex; gap: 20px; justify-content: center;">
              <button id="confirm-disable-2fa" class="btn btn-danger" style="background: #dc3545; border-color: #dc3545; padding: 12px 30px; font-size: 16px; font-weight: bold;">Disable</button>
              <button id="cancel-disable-2fa" class="btn btn-secondary" style="padding: 12px 30px; font-size: 16px; font-weight: bold;">Cancel</button>
            </div>
          </div>
        </div>

        <style>
          #username-change-container {
            margin-top: 10px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          .main-content {
            display: flex;
            justify-content: center;
            margin-top: 30px;
            padding: 0 20px;  
          }
          .profile-container {
            text-align: center;
          }
          .user-username {
            margin-top: 10px;
            margin-bottom: 30px;
            text-align: center;
            color: white;
          }
          #new-username {
            margin-bottom: 10px;
            padding: 5px;
            width: 100%;
          }
          .message {
            margin-top: 10px;
            padding: 8px;
            border-radius: 4px;
            display: none;
          }
          .error-message {
            color: #dc3545;
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
          }
          .success-message {
            color: #28a745;
            background-color: #d4edda;
            border: 1px solid #c3e6cb;
          }
          .info-message {
            color: #0c5460;
            background-color: #d1ecf1;
            border: 1px solid #bee5eb;
          }
          .avatar-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 30px;
          }
        </style>
      </div>
    </div>
  `;
}
