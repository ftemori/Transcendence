import { API_CONFIG } from "../config.js";

// Initialize global chat socket if no game socket is available
export function initGlobalChatSocket() {
  // Only create if no game instance socket is available
  if (window.onlineGameInstance?.socket?.readyState === WebSocket.OPEN) return;
  if (window.tournamentGameInstance?.socket?.readyState === WebSocket.OPEN) return;
  if (window.globalChatSocket?.readyState === WebSocket.OPEN) return;
  
  try {
    window.globalChatSocket = new WebSocket(API_CONFIG.WS_URL);
    
    window.globalChatSocket.onopen = () => {
      console.log("[Chat] Global chat socket connected");
    };
    
    window.globalChatSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chatMessage") {
          const { senderId, senderUsername, message } = data;
          if (senderId && message) {
            openChatWindow(senderId, senderUsername || `User ${senderId}`);
            setTimeout(() => displayChatMessage(senderId, message, false), 0);
          }
        }
      } catch (e) {
        console.error("[Chat] Failed to parse message:", e);
      }
    };
    
    window.globalChatSocket.onclose = () => {
      console.log("[Chat] Global chat socket closed");
      window.globalChatSocket = null;
    };
    
    window.globalChatSocket.onerror = (err) => {
      console.error("[Chat] Global chat socket error:", err);
    };
  } catch (e) {
    console.error("[Chat] Failed to create global chat socket:", e);
  }
}

// Cleanup global chat socket
export function cleanupGlobalChatSocket() {
  if (window.globalChatSocket) {
    try {
      window.globalChatSocket.close();
    } catch {}
    window.globalChatSocket = null;
  }
}

// Helper to display a message in a chat window
export function displayChatMessage(friendId, messageText, isSent = false) {
  const chatWindowId = `chat-window-${friendId}`;
  const messagesContainerId = `chat-messages-${friendId}`;

  let messagesContainer = document.getElementById(messagesContainerId);
  
  // If container doesn't exist, create it
  if (!messagesContainer) {
    const messagesArea = document.getElementById("chat-messages-area");
    if (messagesArea) {
      messagesContainer = createMessagesContainer(friendId);
      messagesArea.appendChild(messagesContainer);
    } else {
      console.warn("Chat messages area not found, cannot create container for friend", friendId);
      return;
    }
  }

  const msgDiv = document.createElement("div");
  msgDiv.style.alignSelf = isSent ? "flex-end" : "flex-start";
  msgDiv.style.maxWidth = "70%";
  msgDiv.style.padding = "5px 10px"; // Reduced from 8px 12px (30% smaller)
  msgDiv.style.borderRadius = "10px"; // Slightly reduced
  msgDiv.style.background = isSent
    ? "rgba(93, 76, 160, 1)"
    : "rgba(255, 255, 255, 0.15)";
  msgDiv.style.color = "white";
  msgDiv.style.fontSize = "13px";
  msgDiv.style.wordWrap = "break-word";
  msgDiv.style.lineHeight = "1.3"; // Compact line height
  msgDiv.textContent = messageText;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Save to sessionStorage
  saveChatMessage(friendId, messageText, isSent);
}

// Helper to get chat history from sessionStorage
function getChatHistory(friendId) {
  try {
    const key = `chat_history_${friendId}`;
    const data = sessionStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Helper to save message to sessionStorage
function saveChatMessage(friendId, message, isSent) {
  try {
    const key = `chat_history_${friendId}`;
    const history = getChatHistory(friendId);
    history.push({ text: message, isSent, timestamp: Date.now() });
    sessionStorage.setItem(key, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save chat message:", e);
  }
}

// Clear all chat history (call on logout)
export function clearAllChatHistory() {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith("chat_history_")) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.error("Failed to clear chat history:", e);
  }
}

// Close chat window (call on logout)
export function closeChatWindow() {
  try {
    const chatWindow = document.getElementById("global-chat-window");
    if (chatWindow) {
      chatWindow.remove();
    }
    // Also cleanup active chats state
    if (window.__globalActiveChats) {
      window.__globalActiveChats.clear();
    }
    window.__globalCurrentChatId = null;
    // Cleanup global chat socket
    cleanupGlobalChatSocket();
  } catch (e) {
    console.error("Failed to close chat window:", e);
  }
}

// Track active chats (friendId -> username mapping)
// Use window-scoped storage so multiple dynamic imports / module instances
// share the same chat state (avoids losing tabs when different modules import this file).
if (!window.__globalActiveChats) window.__globalActiveChats = new Map();
const activeChats = window.__globalActiveChats;
if (window.__globalCurrentChatId === undefined)
  window.__globalCurrentChatId = null;
let currentChatId = window.__globalCurrentChatId;

// Simple chat window with tabs - only ONE window for all chats
export function openChatWindow(friendId, friendUsername) {
  // Add to active chats if not already there
  if (!activeChats.has(friendId)) {
    activeChats.set(friendId, friendUsername);
  }

  // Check if global chat window exists
  let chatWindow = document.getElementById("global-chat-window");

  if (chatWindow) {
    // Window exists, just switch to this chat tab
    switchToChat(friendId);
    return chatWindow;
  }

  // Create the single global chat window
  chatWindow = createGlobalChatWindow();
  document.body.appendChild(chatWindow);

  // Switch to the requested chat
  switchToChat(friendId);

  return chatWindow;
}

// Create the global chat window structure
function createGlobalChatWindow() {
  // Create chat window
  const chatWindow = document.createElement("div");
  chatWindow.id = "global-chat-window";
  chatWindow.style.position = "fixed";
  chatWindow.style.bottom = "20px";
  chatWindow.style.left = "20px";
  chatWindow.style.width = "12cm";
  chatWindow.style.height = "8cm";
  chatWindow.style.background = "rgba(93, 76, 160, 0.05)"; // 30% opacity
  chatWindow.style.border = "1px solid rgba(255,255,255,0.2)";
  chatWindow.style.borderRadius = "8px";
  chatWindow.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  chatWindow.style.zIndex = "9000";
  chatWindow.style.display = "flex";
  chatWindow.style.flexDirection = "column";
  chatWindow.style.overflow = "hidden";
  chatWindow.style.backdropFilter = "blur(10px)";

  // Header with tabs
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.padding = "0";
  header.style.background = "rgba(0,0,0,0.2)";
  header.style.borderBottom = "1px solid rgba(255,255,255,0.1)";

  // Tabs container
  const tabsContainer = document.createElement("div");
  tabsContainer.id = "chat-tabs-container";
  tabsContainer.style.display = "flex";
  tabsContainer.style.flex = "1";
  tabsContainer.style.overflowX = "auto";
  tabsContainer.style.overflowY = "hidden";
  tabsContainer.style.gap = "2px";
  header.appendChild(tabsContainer);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.color = "white";
  closeBtn.style.fontSize = "16px";
  closeBtn.style.lineHeight = "1";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.padding = "7px 12px";
  closeBtn.style.flexShrink = "0";
  closeBtn.addEventListener("click", () => {
    activeChats.clear();
    currentChatId = null;
    chatWindow.remove();
  });
  header.appendChild(closeBtn);

  chatWindow.appendChild(header);

  // Messages area container (holds all chat message containers)
  const messagesArea = document.createElement("div");
  messagesArea.id = "chat-messages-area";
  messagesArea.style.flex = "1";
  messagesArea.style.position = "relative";
  messagesArea.style.overflow = "hidden";
  chatWindow.appendChild(messagesArea);

  // Input container
  const inputContainer = document.createElement("div");
  inputContainer.id = "chat-input-container";
  inputContainer.style.display = "flex";
  inputContainer.style.padding = "7px 10px";
  inputContainer.style.background = "rgba(0,0,0,0.2)";
  inputContainer.style.borderTop = "1px solid rgba(255,255,255,0.1)";
  inputContainer.style.gap = "8px";

  const messageInput = document.createElement("input");
  messageInput.id = "chat-message-input";
  messageInput.type = "text";
  messageInput.placeholder = "Type a message...";
  messageInput.style.flex = "1";
  messageInput.style.padding = "5px 10px";
  messageInput.style.border = "1px solid rgba(255,255,255,0.2)";
  messageInput.style.borderRadius = "6px";
  messageInput.style.background = "rgba(255,255,255,0.1)";
  messageInput.style.color = "white";
  messageInput.style.outline = "none";
  messageInput.style.fontSize = "12px";
  inputContainer.appendChild(messageInput);

  const sendBtn = document.createElement("button");
  sendBtn.id = "chat-send-btn";
  sendBtn.type = "button";
  sendBtn.textContent = "Send";
  sendBtn.style.padding = "5px 14px";
  sendBtn.style.border = "none";
  sendBtn.style.borderRadius = "6px";
  sendBtn.style.background = "rgba(93, 76, 160, 1)";
  sendBtn.style.color = "white";
  sendBtn.style.cursor = "pointer";
  sendBtn.style.fontSize = "12px";
  sendBtn.style.fontWeight = "600";
  sendBtn.addEventListener("mouseover", () => {
    sendBtn.style.background = "rgba(113, 96, 180, 1)";
  });
  sendBtn.addEventListener("mouseout", () => {
    sendBtn.style.background = "rgba(93, 76, 160, 1)";
  });
  inputContainer.appendChild(sendBtn);

  chatWindow.appendChild(inputContainer);

  // Send message handler
  const sendMessage = () => {
    if (!currentChatId) {
      console.warn("[Chat] No active chat selected");
      return;
    }
    const text = messageInput.value.trim();
    if (!text) return;

    // Display message in current chat
    displayMessageInChat(currentChatId, text, true);
    messageInput.value = "";

    // Send via WebSocket - try multiple sources for socket
    let socket = null;
    
    // Try online game instance first
    if (window.onlineGameInstance?.socket?.readyState === WebSocket.OPEN) {
      socket = window.onlineGameInstance.socket;
    }
    // Try tournament game instance
    else if (window.tournamentGameInstance?.socket?.readyState === WebSocket.OPEN) {
      socket = window.tournamentGameInstance.socket;
    }
    // Try global chat socket as fallback
    else if (window.globalChatSocket?.readyState === WebSocket.OPEN) {
      socket = window.globalChatSocket;
    }

    if (socket) {
      try {
        socket.send(
          JSON.stringify({
            type: "chatMessage",
            recipientId: currentChatId,
            message: text,
          })
        );
      } catch (err) {
        console.error("[Chat] Failed to send message:", err);
        // Show error feedback to user
        displayMessageInChat(currentChatId, "(Message failed to send)", true);
      }
    } else {
      console.warn("[Chat] No active WebSocket connection");
      // Show error feedback to user
      displayMessageInChat(currentChatId, "(No connection - message not sent)", true);
    }
  };

  sendBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  return chatWindow;
}

// Switch to a specific chat tab
function switchToChat(friendId) {
  currentChatId = friendId;
  try {
    window.__globalCurrentChatId = currentChatId;
  } catch {}

  // Update tabs
  renderTabs();

  // Show the correct messages container
  const messagesArea = document.getElementById("chat-messages-area");
  if (!messagesArea) return;

  // Hide all message containers
  const allContainers = messagesArea.querySelectorAll('[id^="chat-messages-"]');
  allContainers.forEach((c) => (c.style.display = "none"));

  // Show or create the container for this friend
  let container = document.getElementById(`chat-messages-${friendId}`);
  if (!container) {
    container = createMessagesContainer(friendId);
    messagesArea.appendChild(container);
  }
  container.style.display = "flex";
  container.scrollTop = container.scrollHeight;

  // Focus input
  const input = document.getElementById("chat-message-input");
  if (input) input.focus();
}

// Render the tab bar
function renderTabs() {
  const tabsContainer = document.getElementById("chat-tabs-container");
  if (!tabsContainer) return;

  tabsContainer.innerHTML = "";

  activeChats.forEach((username, friendId) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.textContent = username;
    tab.style.padding = "7px 12px";
    tab.style.border = "none";
    tab.style.background =
      currentChatId === friendId ? "rgba(255,255,255,0.1)" : "transparent";
    tab.style.color = "white";
    tab.style.fontSize = "12px";
    tab.style.cursor = "pointer";
    tab.style.whiteSpace = "nowrap";
    tab.style.borderBottom =
      currentChatId === friendId ? "2px solid rgba(93, 76, 160, 1)" : "none";
    tab.addEventListener("click", () => switchToChat(friendId));
    tab.addEventListener("mouseover", () => {
      if (currentChatId !== friendId) {
        tab.style.background = "rgba(255,255,255,0.05)";
      }
    });
    tab.addEventListener("mouseout", () => {
      if (currentChatId !== friendId) {
        tab.style.background = "transparent";
      }
    });
    tabsContainer.appendChild(tab);
  });
}

// Create a messages container for a specific friend
function createMessagesContainer(friendId) {
  const container = document.createElement("div");
  container.id = `chat-messages-${friendId}`;
  container.style.position = "absolute";
  container.style.inset = "0";
  container.style.padding = "12px";
  container.style.overflowY = "auto";
  container.style.display = "none";
  container.style.flexDirection = "column";
  container.style.gap = "8px";

  // Load chat history
  const history = getChatHistory(friendId);
  history.forEach((msg) => {
    const msgDiv = document.createElement("div");
    msgDiv.style.alignSelf = msg.isSent ? "flex-end" : "flex-start";
    msgDiv.style.maxWidth = "70%";
    msgDiv.style.padding = "5px 10px";
    msgDiv.style.borderRadius = "10px";
    msgDiv.style.background = msg.isSent
      ? "rgba(93, 76, 160, 1)"
      : "rgba(255, 255, 255, 0.15)";
    msgDiv.style.color = "white";
    msgDiv.style.fontSize = "13px";
    msgDiv.style.wordWrap = "break-word";
    msgDiv.style.lineHeight = "1.3";
    msgDiv.textContent = msg.text;
    container.appendChild(msgDiv);
  });

  return container;
}

// Display a message in a specific chat
function displayMessageInChat(friendId, text, isSent) {
  const container = document.getElementById(`chat-messages-${friendId}`);
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.style.alignSelf = isSent ? "flex-end" : "flex-start";
  msgDiv.style.maxWidth = "70%";
  msgDiv.style.padding = "5px 10px";
  msgDiv.style.borderRadius = "10px";
  msgDiv.style.background = isSent
    ? "rgba(93, 76, 160, 1)"
    : "rgba(255, 255, 255, 0.15)";
  msgDiv.style.color = "white";
  msgDiv.style.fontSize = "13px";
  msgDiv.style.wordWrap = "break-word";
  msgDiv.style.lineHeight = "1.3";
  msgDiv.textContent = text;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;

  // Save to history
  saveChatMessage(friendId, text, isSent);
}
