// API Configuration
const isDevelopment =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.match(/^192\.168\.\d+\.\d+$/) || // Local network 192.168.x.x
  window.location.hostname.match(/^10\.\d+\.\d+\.\d+$/) ||   // Local network 10.x.x.x
  window.location.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/); // Local network 172.16-31.x.x

// Get the hostname (either localhost or the actual IP)
const baseHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "localhost"
  : window.location.hostname;

// Detect protocol for development mode
const isHttps = window.location.protocol === "https:";
const wsProtocol = isHttps ? "wss:" : "ws:";

// When using HTTPS, use proxy routes through frontend to avoid mixed content issues
// Backend services are still on HTTP internally, so we proxy through the HTTPS frontend
const useDirectPorts = isDevelopment && !isHttps;

export const API_CONFIG = {
  AUTH_SERVICE_URL: useDirectPorts
    ? `http://${baseHost}:4000`
    : `${window.location.origin}/auth`,
  USER_SERVICE_URL: useDirectPorts
    ? `http://${baseHost}:5100`
    : `${window.location.origin}/users`,
  BACKEND_URL: useDirectPorts
    ? `http://${baseHost}:3000`
    : `${window.location.origin}/api`,
  WS_URL: useDirectPorts
    ? `ws://${baseHost}:3000/game`
    : `${wsProtocol}//${window.location.host}/ws`,
};
