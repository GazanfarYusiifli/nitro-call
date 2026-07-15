# Cross-Device Testing Guide

To test the application on other devices (like your phone) on the same Wi-Fi network:

## Option 1: Local Network (Easiest for same WiFi)
1. Find your computer's local IP address (e.g., `192.168.100.228`).
2. Open the URL: **http://192.168.100.228:5173** on your phone.
3. **IMPORTANT**: Browsers block camera/mic on non-HTTPS sites. On your phone's Chrome:
   - Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
   - Add `http://192.168.100.228:5173` to the list.
   - Select "Enabled" and relaunch Chrome.

## Option 2: Using Ngrok (Recommended for easy HTTPS)
If you want a public, secure URL that works everywhere:
1. Install [ngrok](https://ngrok.com/).
2. Run in a new terminal:
   ```bash
   ngrok http 5173
   ```
3. Use the `https://...` URL provided by ngrok on any device.

## Troubleshooting
- **No Video?** Ensure both devices are on the same network and the backend server (port 5001) is running.
- **Firewall**: Ensure your computer's firewall allows incoming connections on ports 5173 and 5001.
