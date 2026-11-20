# Smart Attendance — shared database

Supabase project: https://supabase.com/dashboard/project/zrkpyboeworyvpqmokmu
Region: Mumbai (ap-south-1)

## First use

1. Publish the repository root to GitHub Pages and use the sign-in link on the home page.
2. Create an account on the website using cherukusaivarun123@gmail.com.
3. Confirm the email, then return to the website and sign in. This verified email is the administrator.
4. Other users create and confirm their accounts. The administrator approves them under Settings > User Approvals.
5. Each approved user registers their own face once. They can then sign in on another device and mark attendance with that device's camera.

Shared data refreshes every 10 seconds. An internet connection is required to save registration or attendance. Choose Punch In or Punch Out before opening the camera. After face verification and the raise-hand challenge, FaceAttend submits the selected action. Each registered person can punch in once and punch out once per day. Both require the device to be inside the configured geofence when it is enabled. Any approved account can operate a shared attendance station. Attendance is saved for the recognized person, regardless of which approved account is signed in. Dates and record times use Asia/Kolkata.

Old browser-only/JSONBin registrations are not automatically copied. Users register once in the new account-based system. No browser master key is required. cloud.js contains only a publishable API key; database access is enforced through row-level security.

Administrator can see all records and remove registrations; approved users can see shared attendance records. Approved users can load shared face templates for browser recognition. New and unapproved users cannot load them.

## Validation performed

- SQL transaction tests: punch in/out, duplicate prevention, pending-user access denial, and attendance isolation. Test data was rolled back.
- Supabase security advisors: no findings.
- JavaScript syntax and mocked startup/recognized-person routing tests passed.
- Live email delivery and physical webcam recognition still need a real user test after publishing.

## Publish

Configure GitHub Pages to publish the repository root. The home page links to
`/attendance/`, and the previous `attendance.html` URL forwards visitors to it.

The canonical URLs and social metadata use the project Pages address. When
moving to a custom domain, update the canonical URLs, share image URLs, sitemap,
robots file, 404 links and styles, and structured data to use the final HTTPS
address.

## Free raise-hand challenge

Keep your hands lowered until prompted, then raise either hand beside your face with the palm toward the camera. No eye-blink or mouth movement is required. The challenge expires, is tied to the recognized person, and is required for both punch actions. The free MediaPipe Hands model is loaded from a pinned CDN version. If detection fails, attendance stays blocked.

This is a browser-side movement check, not verified face liveness. Someone can hold up a face photo and raise a real hand beside it. Videos, modified browsers, and direct authenticated API requests can also bypass the intended check. Do not use it as proof of physical presence. Real phone-camera testing is still required.
