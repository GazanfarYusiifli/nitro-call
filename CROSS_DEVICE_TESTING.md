# Cross-Device Testing Guide

To test the application on other devices (like your phone) on the same Wi-Fi network:

## Option 1: Local Network (Easiest for same WiFi)
1. Find your computer's local IP address (e.g., `192.168.100.228`).
2. Open the URL: **http://192.168.100.228:5173** on your phone.
3. **IMPORTANT**: Browsers block camera/mic on non-HTTPS sites. On your phone's Chrome:
   - Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
   - Add `http://192.168.100.228:5173` to the list.
   - Select "Enabled" and relaunch Chrome.

## Option 2: Production Domain (Recommended)
1. Simply open **http://nitrocalls.online** on any device with internet access.
2. This is the easiest and most secure way to test as it has a valid SSL certificate (via HTTPS redirect if configured, or plain HTTP if not yet secured).

## Troubleshooting
- **No Video?** Ensure the backend server is running and you have granted camera/microphone permissions in your browser.
- **Firewall**: On a local network, ensure your computer's firewall allows incoming connections on ports 5173 and 5001.
