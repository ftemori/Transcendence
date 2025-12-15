import { fetchWithLoader } from "../utils/fetchWithLoader.js";
import { useToast } from "../hooks/useToast.js";
import { API_CONFIG } from "../config.js";
export function useProfile() {
  const getProfileData = async () => {
    try {
      const response = await fetchWithLoader(
        `${API_CONFIG.USER_SERVICE_URL}/profile`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch profile data");
      }

      const data = await response.json();

      // Update avatar display if it exists
      if (data.avatar) {
        setTimeout(() => {
          const avatarPlaceholder = document.querySelector(
            ".avatar-placeholder"
          );
          if (avatarPlaceholder) {
            avatarPlaceholder.style.backgroundImage = `url(${data.avatar})`;
            avatarPlaceholder.style.backgroundSize = "cover";
          }
        }, 0);
      }

      return data;
    } catch (error) {
      console.error("Error fetching profile data:", error);
      return null;
    }
  };

  const updateProfile = async (newData) => {
    try {
      const response = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/update-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(newData),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  const changeUsername = async (newUsername) => {
    try {
      // Update username in the auth service
      const response = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/update-username`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ newUsername }),
        }
      );

      const result = await response.json();
      const { showToast } = useToast();

      if (!response.ok) {
        const msg = result.message || "Failed to update username";
        showToast(msg, "error");
        return { success: false, message: msg };
      }

      showToast("Username updated successfully", "success");
      return { success: true, message: "Username updated successfully" };
    } catch (error) {
      console.error("Error changing username:", error);
      const { showToast } = useToast();
      showToast("An error occurred while changing username", "error");
      return {
        success: false,
        message: "An error occurred while changing username",
      };
    }
  };

  const changeAvatar = () => {
    // Create a hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/jpg";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const { showToast } = useToast();

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        showToast("Image size must be less than 2MB", "error");
        return;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64String = reader.result;

        try {
          const response = await fetchWithLoader(
            `${API_CONFIG.USER_SERVICE_URL}/profile/avatar`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({ avatar: base64String }),
            }
          );

          if (!response.ok) throw new Error("Failed to update avatar");

          // Update the avatar display
          const avatarPlaceholder = document.querySelector(
            ".avatar-placeholder"
          );
          if (avatarPlaceholder) {
            avatarPlaceholder.style.backgroundImage = `url(${base64String})`;
            avatarPlaceholder.style.backgroundSize = "cover";
          }
          showToast("Avatar updated successfully", "success");
        } catch (error) {
          console.error("Error updating avatar:", error);
          showToast("Failed to update avatar", "error");
        }
      };
      reader.readAsDataURL(file);
    };

    input.click();
  };

  const changePassword = async (newPassword, confirmPassword, verification) => {
    try {
      // First check if 2FA is enabled
      const tfaResponse = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/2fa/status`,
        {
          credentials: "include",
        }
      );
      const tfaData = await tfaResponse.json();

      // Now check passwords only if we're not verifying with current password
      if (!(tfaData.success && !tfaData.enabled)) {
        if (newPassword !== confirmPassword) {
          const { showToast } = useToast();
          showToast("Passwords do not match", "error");
          return { success: false, message: "Passwords do not match" };
        }

        if (newPassword.length < 6) {
          const { showToast } = useToast();
          showToast("Password must be at least 6 characters", "error");
          return {
            success: false,
            message: "Password must be at least 6 characters",
          };
        }
      }

      // Send password change request
      const response = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/update-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            newPassword,
            verification,
            requires2FA: tfaData.success && tfaData.enabled,
          }),
        }
      );

      const result = await response.json();
      const { showToast } = useToast();

      if (!response.ok) {
        const msg = result.message || "Failed to update password";
        showToast(msg, "error");
        return {
          success: false,
          message: msg,
          requires2FA: tfaData.success && tfaData.enabled,
        };
      }

      showToast("Password updated successfully", "success");
      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      console.error("Error changing password:", error);
      const { showToast } = useToast();
      showToast("An error occurred while changing password", "error");
      return {
        success: false,
        message: "An error occurred while changing password",
      };
    }
  };

  const startTwoFactorSetup = async () => {
    try {
      const { showToast } = useToast();
      // Try to get current user id from auth service
      const setupRes = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/2fa/setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        }
      );
      const setupData = await setupRes.json();
      if (!setupRes.ok || !setupData.success) {
        showToast(setupData.error || "Failed to start 2FA setup", "error");
        return;
      }

      const container = document.getElementById("twofa-setup");
      if (container) {
        container.innerHTML = `
          <div>
            <p style="margin-bottom: 10px;">Scan this QR with Google Authenticator, then enter the 6-digit code:</p>
            <img src="${setupData.qr}" alt="QR Code" />
            <div class="form-group" style="margin-top:12px;">
              <input type="text" id="twofa-token" placeholder="Enter code" style="margin-bottom: 10px;" />
              <button class="btn btn-primary" id="btn-confirm-2fa">Confirm</button>
            </div>
          </div>
        `;
        const btn = document.getElementById("btn-confirm-2fa");
        if (btn) {
          btn.addEventListener("click", async () => {
            const tokenField = document.getElementById("twofa-token");
            const token =
              tokenField && "value" in tokenField ? tokenField.value : "";
            const enableRes = await fetchWithLoader(
              `${API_CONFIG.AUTH_SERVICE_URL}/2fa/enable`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ token }),
              }
            );
            const enableData = await enableRes.json();
            if (!enableRes.ok || !enableData.success) {
              showToast(enableData.error || "Invalid code", "error");
              return;
            }
            showToast("Two-Factor Authentication enabled", "success");
            container.innerHTML = "<p>2FA is enabled</p>";
            const toggleBtn = document.getElementById("btn-start-2fa");
            if (toggleBtn) toggleBtn.remove();
          });
        }
      }
    } catch (e) {
      const { showToast } = useToast();
      showToast("Network error while enabling 2FA", "error");
    }
  };

  return {
    getProfileData,
    updateProfile,
    changeAvatar,
    startTwoFactorSetup,
    changeUsername,
    changePassword,
  };
}
