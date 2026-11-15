# Smart Attendance — shared database

Supabase project: https://supabase.com/dashboard/project/zrkpyboeworyvpqmokmu
Region: Mumbai (ap-south-1)

## First use

1. Publish attendance.html and cloud.js together to GitHub Pages.
2. Create an account on the website using cherukusaivarun123@gmail.com.
3. Confirm the email, then return to the website and sign in. This verified email is the administrator.
4. Other users create and confirm their accounts. The administrator approves them under Settings > User Approvals.
5. Each approved user registers their own face once. They can then sign in on another device and mark attendance with that device's camera.

Shared data refreshes every 10 seconds. An internet connection is required to save registration or attendance. Automatic recognition punches in; Punch Out ends attendance. Any approved account can operate a shared attendance station. Attendance is saved for the recognized person, regardless of which approved account is signed in. Dates and record times use Asia/Kolkata.

Old browser-only/JSONBin registrations are not automatically copied. Users register once in the new account-based system. No browser master key is required. cloud.js contains only a publishable API key; database access is enforced through row-level security.

Administrator can see all records and remove registrations; approved users can see shared attendance records. Approved users can load shared face templates for browser recognition. New and unapproved users cannot load them.

## Validation performed

- SQL transaction tests: punch in/out, duplicate prevention, pending-user access denial, and attendance isolation. Test data was rolled back.
- Supabase security advisors: no findings.
- JavaScript syntax and mocked startup/recognized-person routing tests passed.
- Live email delivery and physical webcam recognition still need a real user test after publishing.

## Publish

```powershell
cd "C:\Users\hp\Desktop\test\smart attendence"
git add attendance.html cloud.js README.md
git commit -m "Connect attendance to Supabase with shared accounts"
git push
```


## Free camera challenge

Attendance now requires neutral face calibration and two expression changes (close/reopen eyes and open/close mouth) in randomized order. Each state must be held briefly. The challenge is tied to one recognized person, expires quickly, and resets on camera stop, hidden tab, multiple/unknown/missing faces, stale frames, or identity change. Both punch buttons use the same gate.

This is a browser-side still-photo deterrent, not certified or server-verified liveness. Recorded video, generated video, modified JavaScript, or direct authenticated API requests can bypass it. Do not treat it as proof of physical presence for high-assurance attendance. Camera/glasses/lighting/device testing remains required. No new external service or fee is introduced.

Publish attendance.html, cloud.js, and liveness.js together.
