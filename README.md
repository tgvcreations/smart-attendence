# FaceAttend — Smart Attendance System

A smart, browser-based facial recognition attendance system built with HTML5, CSS3, JavaScript, and [face-api.js](https://github.com/justadudewhohacks/face-api.js).

## Features
- **Dashboard**: Real-time stats (Total registered, Present today, Absent today, Attendance rate), today's attendance log, and recent activity.
- **Punch-In / Punch-Out**: Automatic tracking of In and Out times with total hours calculation.
- **Working Hours & Status Rules**: Configurable thresholds in Settings for **Full Day** and **Half Day** status marking.
- **Face Registration**: Enrolls new individuals by capturing facial landmarks and 128-d face descriptors locally in `localStorage`.
- **Live Recognition Camera**: Automatic face detection, bounding box overlay, confidence scores, and anti-duplicate cooldowns.
- **People & Records Management**: Searchable directory, attendance history filtering by date, and CSV export.

## Quick Start
1. Ensure Python or Node.js is installed.
2. Run the local server:
   - Double-click `start-server.bat` (Windows)
   - Or run: `python -m http.server 8080`
3. Open `http://localhost:8080/attendance.html` in your browser.
