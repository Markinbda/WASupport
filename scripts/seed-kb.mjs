#!/usr/bin/env node
/**
 * Seed the knowledge base with 50 starter articles covering Windows,
 * Microsoft 365 (Outlook, Teams, OneDrive, Word, Excel, PowerPoint, OneNote,
 * Forms, Stream) and common laptop hardware issues a teacher might hit.
 *
 *   node --env-file=.env.local scripts/seed-kb.mjs
 *
 * Uses the service role key so RLS is bypassed.
 * Idempotent: upserts by `slug`. Re-running will refresh content but keep
 * existing view_count / created_at intact.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** @type {Array<{slug:string,title:string,summary:string,department:'IT'|'FAC'|'HS'|null,tags:string[],body_md:string}>} */
const ARTICLES = [
  // ─────────── WINDOWS ───────────
  {
    slug: 'sign-in-windows-school-account',
    title: 'Sign in to Windows with your school account',
    summary: 'First-time setup of a school-issued Windows laptop using your Warwick Academy email.',
    department: 'IT',
    tags: ['windows', 'sign-in', 'sso', 'onboarding'],
    body_md: `## Before you start
You'll need your **firstname.lastname@warwickacademy.bm** email and the temporary password sent to you by IT.

## Steps
1. Power on the laptop and connect to **Warwick-Staff** Wi-Fi (see [Connect to school Wi-Fi](/kb/connect-school-wifi)).
2. At the sign-in screen, choose **Other user**, then enter your full school email and temporary password.
3. When prompted, set a new password (min 12 characters, mixed case + number).
4. Approve the Microsoft Authenticator prompt on your phone to complete MFA enrolment.
5. Wait 5–10 minutes for OneDrive, Outlook and Teams to finish provisioning before opening them.

## When to escalate
If you don't have Authenticator set up or the temporary password is rejected, raise an [IT ticket](/new) — IT will reset and resend.`,
  },
  {
    slug: 'reset-forgotten-windows-password',
    title: 'Reset a forgotten Windows / school password',
    summary: 'Self-service password reset using https://aka.ms/sspr.',
    department: 'IT',
    tags: ['windows', 'password', 'sspr', 'sign-in'],
    body_md: `If you've forgotten your password you can reset it yourself **without raising a ticket**, provided you've previously enrolled in MFA.

## Steps
1. From any device, go to <https://aka.ms/sspr>.
2. Enter your **school email** and the captcha.
3. Choose a verification method: Authenticator app push, SMS to your registered mobile, or alternate email.
4. Set a new password (cannot match your last 5 passwords).
5. Wait 2 minutes, then sign in to your laptop normally — Windows will pick up the new password once it can reach the network.

> **Tip**: If you're at the lock screen and can't get to a browser, plug in an Ethernet cable so Windows can sync the new password before you sign in.

## When to escalate
SSPR fails, or you've never enrolled in MFA → raise an IT ticket and we'll do an admin reset.`,
  },
  {
    slug: 'windows-update-stuck',
    title: 'Windows Update is stuck or keeps failing',
    summary: 'How to force-clear a stuck update and re-trigger the download.',
    department: 'IT',
    tags: ['windows', 'updates', 'troubleshooting'],
    body_md: `## Quick fixes (try in order)
1. **Restart twice** — Start → Power → Restart, then again. Many "stuck" updates finish on the second reboot.
2. **Pause and resume**: Settings → Windows Update → Pause for 1 week, then click *Resume updates*.
3. **Run the troubleshooter**: Settings → System → Troubleshoot → Other troubleshooters → Windows Update → Run.
4. **Free up disk space**: updates need ~10 GB free. See [Free up space on a school laptop](/kb/free-up-disk-space).

## Still stuck?
Open PowerShell **as administrator** and run:

\`\`\`powershell
Stop-Service -Name wuauserv,bits -Force
Remove-Item "$env:windir\\SoftwareDistribution\\Download\\*" -Recurse -Force
Start-Service -Name wuauserv,bits
\`\`\`

Then re-check for updates.

## When to escalate
Same KB article ID fails 3+ times, or you see error \`0x80070643\` repeatedly — IT can push the update centrally.`,
  },
  {
    slug: 'slow-windows-performance',
    title: 'Windows feels slow — first-aid checklist',
    summary: 'Five quick things to try before raising a ticket about a sluggish laptop.',
    department: 'IT',
    tags: ['windows', 'performance', 'troubleshooting'],
    body_md: `## Run through these in order
1. **Restart**. Not "lock and walk away" — actually *Restart* from the Start menu. Most slowdowns clear here.
2. **Close OneDrive and Teams** from the system tray, then re-open. They're the two biggest CPU hogs on a teaching laptop.
3. **Check disk space**: Start → Storage. If your C: drive is below 10 GB free, that alone will tank performance — see [Free up space](/kb/free-up-disk-space).
4. **Disable startup apps you don't use**: Ctrl+Shift+Esc → Startup apps → right-click anything you don't recognise → Disable.
5. **Plug in to mains**: on battery, Windows runs the CPU at ~30% throttle by default.

## Useful diagnostic
Press **Ctrl+Shift+Esc** to open Task Manager → Performance tab. If CPU sits at 100% with nothing running, take a screenshot and attach it to your IT ticket — that points us at the right culprit.

## When to escalate
After all five steps the laptop is still unusable, or it's >4 years old — raise an IT ticket.`,
  },
  {
    slug: 'free-up-disk-space',
    title: 'Free up disk space on a school laptop',
    summary: 'Find and remove the biggest space hogs without losing your work.',
    department: 'IT',
    tags: ['windows', 'storage', 'onedrive', 'cleanup'],
    body_md: `## Built-in cleanup (safe)
1. Settings → System → Storage → **Cleanup recommendations**.
2. Tick *Temporary files*, *Recycle Bin*, *Previous Windows installation* (if shown). Click **Clean up**.
3. Under *Apps*, sort by size and uninstall anything personal you no longer need.

## OneDrive Files On-Demand
By default OneDrive keeps **online-only** copies of files until you open them. If you're full, right-click any large folder in OneDrive → **Free up space** to push it back to the cloud.

## Common space hogs to check
| Folder | Why |
|---|---|
| \`Downloads\` | Old installers, lesson resources |
| \`Pictures\\Camera Roll\` | Phone backups |
| \`Videos\` | Lesson recordings — move to Stream |
| \`%TEMP%\` (Win+R, type \`%temp%\`) | Stale install scratch files |

## When to escalate
If after cleanup your C: drive is still <10 GB free, raise an IT ticket — we may need to grow your OneDrive quota or check for runaway log files.`,
  },
  {
    slug: 'connect-school-wifi',
    title: 'Connect to school Wi-Fi (Warwick-Staff)',
    summary: 'How to join Warwick-Staff and what to do if it won\'t connect.',
    department: 'IT',
    tags: ['windows', 'wifi', 'network'],
    body_md: `## Joining for the first time
1. Click the network icon in the system tray.
2. Choose **Warwick-Staff** → tick *Connect automatically* → **Connect**.
3. Sign in with your **full school email** and password.
4. Accept the certificate prompt (this only appears once per device).

## "Can't connect to this network"
1. Forget the network: Settings → Network & Internet → Wi-Fi → Manage known networks → Warwick-Staff → **Forget**.
2. Re-join from step 1 above.
3. If it still fails, switch to **Warwick-Guest** temporarily so you can keep working, and raise an IT ticket.

## Slow Wi-Fi in a specific room?
That's usually an access-point coverage issue, not your laptop. Note the room and time, and raise a ticket — Facilities and IT triage these together.`,
  },
  {
    slug: 'map-network-drive',
    title: 'Map a network drive (legacy shared folders)',
    summary: 'Reconnect to file shares like \\\\WA-FILES that haven\'t moved to SharePoint yet.',
    department: 'IT',
    tags: ['windows', 'network', 'shares'],
    body_md: `Most resources have moved to SharePoint and Teams, but a few legacy shares still exist (e.g. \`\\\\wa-files\\Common\`).

## Steps
1. Open **File Explorer** → right-click *This PC* → **Map network drive**.
2. Choose a drive letter (e.g. **S:**).
3. Folder: \`\\\\wa-files\\Common\` (or whichever path IT has given you).
4. Tick *Reconnect at sign-in* and *Connect using different credentials* if prompted.
5. Use **WA\\\\firstname.lastname** as the username and your school password.

> If you see *"The network path was not found"*, you're probably off-site. School shares only work when on Warwick-Staff Wi-Fi or via VPN.

## When to escalate
You don't know the path, or the share works for colleagues but not you → IT ticket.`,
  },
  {
    slug: 'bluetooth-pairing',
    title: 'Pair a Bluetooth device (headphones, mouse, keyboard)',
    summary: 'Standard Windows Bluetooth pairing and common gotchas.',
    department: 'IT',
    tags: ['windows', 'bluetooth', 'hardware'],
    body_md: `## Steps
1. Put the device into **pairing mode** (check the manufacturer's instructions — usually a button held 3–5 seconds until the LED flashes).
2. On the laptop: Settings → Bluetooth & devices → **Add device** → Bluetooth.
3. Pick the device from the list and confirm any code shown.

## If pairing fails
- Toggle Bluetooth off and on (top of the same Settings page).
- Forget the device on the laptop *and* on any phone/tablet it's also paired with — most consumer earbuds only remember one device at a time.
- Make sure the device is fully charged.

## Audio device works but sounds bad in Teams
Windows uses two Bluetooth profiles: **A2DP** (high-quality, no mic) and **Hands-Free** (low-quality, includes mic). When Teams opens the mic, Windows switches to Hands-Free, which sounds tinny. Fix: use a wired headset for meetings or a USB adapter.`,
  },
  {
    slug: 'add-printer',
    title: 'Add a printer (staffroom / classroom)',
    summary: 'Connect to a school printer over the network.',
    department: 'IT',
    tags: ['windows', 'printing', 'hardware'],
    body_md: `## On Warwick-Staff Wi-Fi
1. Settings → Bluetooth & devices → **Printers & scanners** → **Add device**.
2. Wait 30 seconds; the school printers should appear by name (e.g. *Staffroom-Mono*, *MS-Colour*).
3. Click **Add device** next to the right one. Drivers install automatically.

## Printer doesn't appear in the list
1. Click **Add manually** → *Add a printer using IP address* → enter the IP shown on the printer's display panel.
2. Choose **TCP/IP**, leave the port name as default, and let Windows pick the driver.

## Stuck print job
Settings → Printers → click the printer → **Open print queue** → cancel the stuck job. If it says *"Deleting"* but never goes away, restart the laptop or, in PowerShell as admin, run \`Restart-Service Spooler\`.`,
  },
  {
    slug: 'screenshot-tools',
    title: 'Take a screenshot on Windows',
    summary: 'Win+Shift+S, Snipping Tool, and screen recording.',
    department: null,
    tags: ['windows', 'productivity', 'screenshot'],
    body_md: `## Quick screenshot
- **Win + Shift + S** → drag a region. The screenshot is copied to clipboard *and* saved to \`Pictures\\Screenshots\`. A toast appears bottom-right — click it to annotate.

## Recording your screen
- Open **Snipping Tool** → switch from photo to **video** icon at the top → **+ New** → select region → record.
- For lessons, use **Clipchamp** (built into Windows) or **PowerPoint → Record** for narrated slides.

## Capture just the active window
- **Alt + PrtSc** — copies the active window to clipboard. Paste into Word, Teams, etc.

## Keyboards without PrtSc
On many newer laptops PrintScreen is on **Fn + Insert** or **Fn + W**. Check your keyboard's secondary labels (printed in a different colour).`,
  },
  {
    slug: 'external-monitor-setup',
    title: 'Connect an external monitor or projector',
    summary: 'HDMI/USB-C/DisplayPort setup, extend vs duplicate, and resolution fixes.',
    department: 'IT',
    tags: ['windows', 'display', 'hardware', 'classroom'],
    body_md: `## Connect
1. Plug HDMI / USB-C / DisplayPort into the monitor or projector. Most school AVs use HDMI.
2. **Win + P** → choose **Duplicate** (mirrors), **Extend** (separate desktop), or **Second screen only**.
3. Right-click the desktop → **Display settings** to drag screens into the right physical layout.

## Common fixes
- **Blurry text on the projector**: set the projector's resolution to its native value (usually 1920×1080) under Display settings → Advanced display.
- **Wrong refresh rate / flicker**: Display settings → Advanced display → choose 60 Hz.
- **No signal**: try a different cable; HDMI cables fail more often than ports do. Most classrooms have a spare in the AV cupboard.

## Wireless to AppleTV / Miracast in classrooms
Win + K → pick the room's display name. If it doesn't appear, the AppleTV needs power-cycling — flip the wall switch off for 10 seconds. Persistent failures → Facilities ticket (it's their AV).`,
  },
  {
    slug: 'smartscreen-warning',
    title: 'Windows blocked an app I need (SmartScreen / "Unknown publisher")',
    summary: 'How to safely run a legitimate app SmartScreen has flagged.',
    department: 'IT',
    tags: ['windows', 'security', 'smartscreen'],
    body_md: `Windows shows *"Windows protected your PC"* when an app isn't signed by a recognised publisher. **Don't bypass this for anything you didn't deliberately download from a trusted source.**

## If you're sure it's legitimate
1. Click **More info** on the warning dialog.
2. A **Run anyway** button will appear.
3. Click it.

## If you're not sure
- Check the source URL. Was it an email link or download from a search result? Treat it as suspicious.
- Ask in your dept Teams channel if anyone else uses it.
- Raise an IT ticket and attach the installer — we'll verify the signature.

## Recurring false positives
For approved tools (e.g. CAS Online, exam software), IT can whitelist the publisher centrally so the warning never appears.`,
  },
  {
    slug: 'bitlocker-recovery-key',
    title: 'BitLocker is asking for a recovery key',
    summary: 'What to do when your laptop boots to a blue BitLocker screen.',
    department: 'IT',
    tags: ['windows', 'bitlocker', 'security'],
    body_md: `Sometimes after a Windows update or BIOS change, BitLocker locks the drive and demands a 48-digit recovery key.

## Get the key
1. From your phone, go to <https://account.microsoft.com/devices/recoverykey> (or <https://aka.ms/aadrecoverykey> for school-managed devices).
2. Sign in with your **school account**.
3. Find your device by name and copy the matching key (use the Key ID shown on the BitLocker screen to match).
4. Type it into the laptop. It only needs to be entered once.

## Why this happens
- Windows feature updates, especially when combined with a TPM firmware change.
- Booting from a USB stick.
- Hardware change (e.g. swapped SSD or motherboard).

## When to escalate
You can't sign in to <https://aka.ms/aadrecoverykey>, or the key is rejected — raise an IT ticket urgently and we'll pull the key from Intune.`,
  },

  // ─────────── MICROSOFT 365 GENERAL ───────────
  {
    slug: 'install-office-on-personal-device',
    title: 'Install Microsoft 365 on a personal device (free for staff)',
    summary: 'You get up to 5 installs of Office per staff licence — at no cost to you.',
    department: null,
    tags: ['m365', 'install', 'licence', 'personal-device'],
    body_md: `Warwick Academy's M365 A3 licence gives every member of staff **5 installs** of the Office desktop apps for personal use.

## Steps
1. From the personal device's browser, go to <https://office.com>.
2. Sign in with your **school email**.
3. Top-right → **Install apps** → **Microsoft 365 apps**.
4. Run the installer (~3 GB download).
5. When the apps open, sign in with the same school account.

## Important
- Files you save sign-in to OneDrive go to your **school OneDrive**, not a personal one. Be mindful when working on private documents at home.
- If you leave Warwick, the licence and your access end on your last day.

## Manage your installs
<https://account.microsoft.com/account/manage-installs> — sign out of devices you no longer use to free up a slot.`,
  },
  {
    slug: 'switch-school-personal-account',
    title: 'Switch between school and personal accounts in Office',
    summary: 'How to add a second account in Word/Excel/Teams and pick the right one for each file.',
    department: null,
    tags: ['m365', 'accounts', 'sign-in'],
    body_md: `Office desktop apps let you sign in with multiple accounts at once.

## Add an account
1. In Word/Excel/PowerPoint: **File → Account → Add a service → Sign in**.
2. Enter the second account's email + password + MFA.

## Switch between them
- Top-right of any Office app → click your profile picture → choose the account.
- New documents are saved to the OneDrive of whichever account you're currently signed in as — **always check before clicking Save**.

## Teams
Teams supports two accounts side-by-side: top-right initials → *Add another account*. A coloured ring around your avatar shows which account is active.

## Common mistake
Sharing a "school" link from your personal account → recipients can't open it because the file lives in your personal OneDrive. Right-click the file → *Share* and check the URL contains \`warwickacademy\` before sending.`,
  },
  {
    slug: 'office-license-expired',
    title: 'Office says "We can\'t verify your subscription"',
    summary: 'Sign-out / sign-in fix for Office activation errors.',
    department: 'IT',
    tags: ['m365', 'licence', 'activation'],
    body_md: `## Quick fix
1. Open Word → **File → Account → Sign out**. Confirm.
2. Close all Office apps **and Outlook**.
3. Re-open Word → **Sign in** with your school email.
4. Approve MFA.

## If that fails
1. Settings → Accounts → **Access work or school** → click your school account → **Disconnect**.
2. Restart the laptop.
3. Open Word → sign in → it'll re-add the work account automatically.

## When to escalate
Sign-in succeeds but Office still shows "Unlicensed Product" → IT ticket. Your licence may have been suspended or moved.`,
  },
  {
    slug: 'onedrive-sync-issues',
    title: 'OneDrive isn\'t syncing — first aid',
    summary: 'Pause/resume, conflict files, and the nuclear "reset OneDrive" command.',
    department: 'IT',
    tags: ['m365', 'onedrive', 'sync'],
    body_md: `## Step 1 — pause then resume
Right-click the OneDrive cloud icon (system tray) → **Pause syncing → 2 hours** → wait 30 seconds → **Resume syncing**. This kicks the sync engine.

## Step 2 — check for conflicts
Files with names like \`Lesson plan-MyLaptop.docx\` are conflict copies. Open both, merge changes, delete the conflict.

## Step 3 — reset OneDrive (nuclear)
Win + R, then paste:

\`\`\`
%localappdata%\\Microsoft\\OneDrive\\onedrive.exe /reset
\`\`\`

OneDrive icon vanishes for ~2 minutes then comes back. Sign in again. **Your files are not deleted** — only the local cache is rebuilt.

## Step 4 — check storage
<https://onedrive.com> → Settings → *Storage*. If you're full, sync stops globally. Free up files or request more from IT.

## When to escalate
After all four steps the same file still won't sync, or you see *"Sync is paused for files in shared libraries"* — IT ticket with the file path.`,
  },
  {
    slug: 'onedrive-files-on-demand',
    title: 'OneDrive Files On-Demand — green ticks vs cloud icons',
    summary: 'Understand what\'s on your laptop vs the cloud, and how to control it.',
    department: null,
    tags: ['m365', 'onedrive', 'storage'],
    body_md: `Each file in OneDrive shows one of three status icons:

| Icon | Meaning |
|---|---|
| ☁️ Cloud outline | Online-only. Takes 0 disk space. Opens require internet. |
| ✅ Green tick (outline) | Cached locally after you opened it. Will be evicted if disk gets full. |
| ✅ Green tick (filled) | **Always keep on this device.** Available offline; never evicted. |

## Make a folder always available offline
Right-click the folder in File Explorer → **Always keep on this device**. Use this for files you need on a flight or when Wi-Fi is patchy.

## Free up space
Right-click → **Free up space**. The file becomes online-only again. Safe — nothing is deleted from the cloud.

## Use case for teachers
Mark this term's planning folder as *Always keep*; mark old years and large media as *Free up space*. Keeps you fast and saves the SSD.`,
  },
  {
    slug: 'sharepoint-vs-teams-files',
    title: 'Where should I save this file? OneDrive vs SharePoint vs Teams',
    summary: 'A simple decision tree for staff content.',
    department: null,
    tags: ['m365', 'onedrive', 'sharepoint', 'teams', 'collaboration'],
    body_md: `## Quick rule
| Audience | Save it in… |
|---|---|
| Just me | **OneDrive** |
| My department | **SharePoint** site for that department |
| A specific class or working group | **Teams** (Files tab) |
| All staff | The **Staff Hub** SharePoint site |

## Why it matters
- Files in *Teams* and *SharePoint* are owned by the team — they survive when staff leave.
- Files in *OneDrive* are owned by you and may be **deleted 30 days after you leave** unless transferred.
- Sharing a OneDrive file widely is fine, but bake-in the team perspective by moving it to SharePoint once others rely on it.

## Moving a file
File Explorer (with OneDrive sync) → drag from your OneDrive folder to the SharePoint or Teams folder. The file moves; the link stays valid (Microsoft auto-redirects), but tell collaborators anyway.`,
  },
  {
    slug: 'recover-deleted-onedrive-file',
    title: 'Recover a deleted file from OneDrive or SharePoint',
    summary: 'Two-stage recycle bin gives you ~93 days to get a file back.',
    department: null,
    tags: ['m365', 'onedrive', 'sharepoint', 'recovery'],
    body_md: `## OneDrive (your files)
1. <https://onedrive.com> → sign in → **Recycle bin** (left rail).
2. Files stay here for **30 days** by default.
3. Tick the file → **Restore**.

## Second-stage recycle bin
If you've already emptied the recycle bin, click **Second-stage recycle bin** at the bottom — gives another **63 days**.

## SharePoint / Teams files
1. Open the team / SharePoint site → **Documents** library.
2. Top-right gear → **Recycle bin** → restore.

## Restore an entire deleted folder structure
Use *Restore your OneDrive* (Settings → Restore your OneDrive on <https://onedrive.com>) — rolls back everything to a chosen point in time within 30 days. Useful after ransomware or a large accidental delete.

## When to escalate
Past the 93-day window, or files were deleted by someone else's account — raise an IT ticket. We can sometimes recover from backup.`,
  },

  // ─────────── OUTLOOK ───────────
  {
    slug: 'outlook-not-syncing',
    title: 'Outlook won\'t send or receive',
    summary: 'Working Offline, send/receive errors, and rebuilding the profile.',
    department: 'IT',
    tags: ['m365', 'outlook', 'email'],
    body_md: `## Check the obvious
1. Bottom of Outlook says *"Working Offline"*? → **Send/Receive** ribbon → click **Work Offline** to toggle it off.
2. Right-click the Outlook icon in the tray → **Connection status** → all green?
3. <https://outlook.office.com> in a browser — does new mail arrive there? If yes, it's a *desktop client* problem, not a server problem.

## Send/Receive errors with codes
- \`0x800CCC0E\` — connectivity. Check Wi-Fi.
- \`0x8004010F\` — profile corruption. Recreate the profile (see below).

## Rebuild your Outlook profile
1. Close Outlook.
2. Control Panel → **Mail (32-bit)** → **Show Profiles** → **Add** → name it "School2".
3. Sign in with your school account → **Set as default** → start Outlook with the new profile.
4. Initial sync can take 30 minutes for a large mailbox; let it finish before searching.

## When to escalate
Web Outlook also doesn't sync, or you can't sign in at all → urgent IT ticket.`,
  },
  {
    slug: 'outlook-out-of-office',
    title: 'Set up an out-of-office / automatic reply',
    summary: 'Schedule auto-replies for half-term, sick days, or while travelling.',
    department: null,
    tags: ['m365', 'outlook', 'email'],
    body_md: `## Outlook desktop
1. **File → Automatic Replies (Out of Office)**.
2. Tick *Send automatic replies*.
3. Tick *Only send during this time range* and pick start/end (the reply turns itself off automatically — recommended).
4. **Inside My Organisation** tab — message for colleagues.
5. **Outside My Organisation** tab — message for parents/external. Tick *Send replies outside my organisation* and choose *My contacts only* (avoids replying to spam).
6. **OK**.

## Outlook on the web
<https://outlook.office.com> → gear icon → *View all Outlook settings* → **Mail → Automatic replies**.

## Recommended template for teachers
> Thank you for your email. I'm out of the classroom until **[date]** and won't be checking email regularly. For urgent matters please contact the **[Department]** office at [email]. I'll respond on my return.

## Tip
Set the end date to your **first day back at lunch** rather than the morning, so you don't get buried before assembly.`,
  },
  {
    slug: 'outlook-shared-mailbox',
    title: 'Add a shared mailbox to Outlook',
    summary: 'For department, role-based, or class mailboxes (e.g. itsupport@, examsoffice@).',
    department: 'IT',
    tags: ['m365', 'outlook', 'shared-mailbox'],
    body_md: `## Auto-mapping (most common)
If IT have given you access, the mailbox usually appears in your folder list within 60 minutes — restart Outlook to pick it up. No manual setup needed.

## Manual add (if it doesn't appear)
1. Outlook → **File → Account Settings → Account Settings**.
2. Pick your school account → **Change → More Settings → Advanced**.
3. **Add** → type the shared mailbox email → **OK** → **Next** → **Finish**.
4. Restart Outlook.

## Sending as the shared mailbox
- New email → **Options ribbon → From** → choose the shared address.
- Replies *inherit* the address you received the mail on — but **always check the From line** before clicking Send.

## When to escalate
You can't see the shared mailbox even after restart → request access via IT ticket, naming the mailbox.`,
  },
  {
    slug: 'recover-deleted-email',
    title: 'Recover a deleted email',
    summary: 'Recently-deleted folder + Recover items server-side.',
    department: null,
    tags: ['m365', 'outlook', 'recovery'],
    body_md: `## Step 1 — Deleted Items folder
Most "deleted" emails are still in **Deleted Items**. Right-click the email → **Move → Inbox**.

## Step 2 — Recoverable Items (after emptying Deleted Items)
1. Click **Deleted Items** in the folder list.
2. Top of the message list: **Recover items recently removed from this folder**.
3. Tick items → **Restore Selected Items → OK**.
4. Restored emails go back to *Deleted Items* — move them to Inbox.

## Time limit
Recoverable items are kept for **30 days**, then permanently purged.

## When to escalate
Past 30 days, or someone else (cleaner script, mailbox delegate) deleted them — raise an IT ticket within **14 more days**; Microsoft can sometimes recover from a hidden purge.`,
  },
  {
    slug: 'phishing-report',
    title: 'Spot and report a phishing email',
    summary: 'Use the Report ribbon button — don\'t just delete.',
    department: null,
    tags: ['m365', 'outlook', 'security', 'phishing'],
    body_md: `## How to recognise it
- **Urgency** ("Your account will be closed in 24 hours").
- **Mismatched sender**: display name says *Microsoft*, real address is \`@gmail.com\` or a random domain.
- **Suspicious link**: hover (don't click) — does the URL match the company it claims to be from?
- **Unexpected attachments**, especially .htm, .zip, .iso.

## Report it
1. Select the email.
2. **Home ribbon → Report → Report phishing**.
3. Click **Report** in the dialog. The email is sent to Microsoft and IT, then deleted from your mailbox.

## If you clicked a link or entered a password
1. **Immediately** change your password at <https://aka.ms/sspr>.
2. Sign out of all sessions: <https://account.microsoft.com> → Devices → *Sign out everywhere*.
3. Raise an **urgent IT ticket** so we can review your sign-in logs.

> Reporting works even for the dodgy 419 scams — every report tunes our spam filter.`,
  },
  {
    slug: 'reduce-mailbox-size',
    title: 'Reduce mailbox size when you hit the quota',
    summary: 'Mailbox Cleanup, large items, and archiving old years.',
    department: null,
    tags: ['m365', 'outlook', 'storage'],
    body_md: `Staff mailboxes are 100 GB. If you\'re close to the limit Outlook starts complaining and may stop sending mail.

## Use Mailbox Cleanup
**File → Tools → Mailbox Cleanup**:
- *Find items larger than 5000 KB* — usually a few of these clear hundreds of MB.
- *Empty Deleted Items*.
- *AutoArchive* (only for desktop archives — see below).

## Sort by size
Inbox → click the **Filter / Arrange By** menu → **Size**. Quickly find your top 20 offenders.

## Big offenders — what to do
- **Old marketing newsletters**: bulk delete by sender (right-click sender → *Find related → From this sender*).
- **Personal videos / photos**: move to OneDrive.
- **Distribution-list traffic**: unsubscribe.

## Don't use PST archives
PSTs sit on your laptop, aren't backed up, and don't sync between devices. If you genuinely need long-term retention, ask IT — we can enable an **Online Archive** (additional 100 GB, searchable everywhere).`,
  },

  // ─────────── TEAMS ───────────
  {
    slug: 'teams-camera-mic',
    title: 'Teams — camera or mic isn\'t working',
    summary: 'Permissions, device pickers, and the system tray reset.',
    department: 'IT',
    tags: ['m365', 'teams', 'audio', 'video', 'meetings'],
    body_md: `## Step 1 — pick the right device in Teams
- In a meeting: top-right *…* → **Device settings**.
- Outside a meeting: avatar → **Settings → Devices**.
- Make sure *Speaker*, *Microphone* and *Camera* point to the device you intend to use (not "Default").

## Step 2 — Windows privacy permissions
Settings → Privacy & security → **Camera** / **Microphone** → Microsoft Teams = **On**.

## Step 3 — close other apps using the device
Zoom, Snip & Sketch, OBS or even a browser tab can hold the camera. Close everything, then re-open Teams.

## Step 4 — reset Teams
Right-click Teams in the system tray → **Quit**. Then re-open from Start.

## Step 5 — reinstall
For new Teams: Settings → Apps → *Microsoft Teams* → **Repair**, then **Reset**.

## When to escalate
Webcam works in the Camera app but not Teams → escalate. Webcam doesn't work in *anything* → see [Webcam not working](/kb/webcam-not-working).`,
  },
  {
    slug: 'teams-echo-feedback',
    title: 'Teams meeting has echo or feedback',
    summary: 'Stop the screech in 30 seconds.',
    department: null,
    tags: ['m365', 'teams', 'audio', 'meetings'],
    body_md: `Echo happens when **two devices in the same room** are both joined to the same meeting unmuted.

## Fast fix in the room
1. Identify which laptop has the speaker output enabled.
2. **Mute every other laptop in the room.**
3. Use one room mic (or the laptop closest to the speaker).

## If it's still echoing
- Use a headset for participants in the room rather than laptop speakers — eliminates feedback entirely.
- In Teams device settings, turn on **Noise suppression: High** and **Echo cancellation**.
- If you're using Bluetooth earbuds, switch to wired — Bluetooth latency causes a delayed echo that AEC can\'t fully fix.

## "I hear myself"
Means the **other** end has their speaker bleeding into their mic. Ask them to mute speakers or use a headset.`,
  },
  {
    slug: 'teams-schedule-class-meeting',
    title: 'Schedule a Teams meeting for a class',
    summary: 'Channel meetings vs personal meetings — pick the right one.',
    department: null,
    tags: ['m365', 'teams', 'meetings', 'classroom'],
    body_md: `## Channel meeting (recommended for classes)
Posts the invite in the channel; recording, chat and files all stay in the team.

1. In Teams → open the **class team** → **General** channel.
2. Bottom of the channel: **Meet → Schedule a meeting**.
3. Title, date/time → **Send**. Students get the invite via the channel and their calendar.

## Personal calendar meeting
For 1:1s, parents' evenings, or external participants.

1. Calendar tab → **+ New meeting**.
2. Add attendees by email (external addresses are fine).
3. Under *Options* (after creating): set **Who can bypass the lobby** → *People in my org* if you want a controlled start.

## Recurring lessons
Pick *Does not repeat* → choose a recurrence pattern. **Tip**: half-term breaks aren't auto-skipped; trim the series after creating.

## Recording
In meeting → *…* → **Start recording**. Recording lands in the channel's *Files → Recordings* folder (channel meetings) or in the organiser's OneDrive (personal meetings).`,
  },
  {
    slug: 'teams-share-screen-ppt',
    title: 'Share screen and PowerPoint Live in Teams',
    summary: 'Three sharing modes and which one to use when.',
    department: null,
    tags: ['m365', 'teams', 'meetings', 'powerpoint'],
    body_md: `In a meeting → **Share** (top bar) → choose:

| Mode | Use when |
|---|---|
| **Screen** | You're switching between many apps — students see *exactly* what you see. |
| **Window** | Sharing one app and you don\'t want notifications visible. |
| **PowerPoint Live** | Presenting a deck. **Strongly preferred.** Students get private slide navigation, accessibility translation, and you can see notes. |

## PowerPoint Live tips
- Tick *Include computer sound* if your slides have video/audio.
- Hide the slide thumbnails strip from students with the eye icon if you want them to follow your pace.
- Use **Standout / Cameo** to overlay your webcam on the slide.

## Stop sharing
Top of the screen → **Stop sharing**. Or **Win + Shift + X**.

## Avoiding the "small text" complaint
Press **F5** in PowerPoint to enter Slide Show mode before sharing — Teams then shares slides at full resolution. Sharing the *editor view* is a common reason students say "we can\'t read it".`,
  },
  {
    slug: 'teams-class-vs-staff',
    title: 'Class teams vs staff teams — etiquette and structure',
    summary: 'Channels, posts, replies and @mentions.',
    department: null,
    tags: ['m365', 'teams', 'classroom', 'collaboration'],
    body_md: `## Use channels, not @everyone in General
- Create a channel per topic, e.g. *Homework*, *Y10 Coursework*, *Trip — Geography Field Day*.
- Reserve **General** for whole-class admin announcements only.

## Always reply, don\'t post
Hit **Reply** under the parent post rather than starting a new thread for the same topic. Keeps conversations together — invaluable when a student misses a week.

## @Mentions
- \`@channel name\` — pings everyone subscribed.
- \`@person\` — pings just them.
- \`@team\` — please use sparingly, especially out of hours.

## Class team templates
When IT creates a class team it gets:
- *General*, *Homework*, *Resources* channels.
- Class Notebook integration (see [OneNote Class Notebook](/kb/onenote-class-notebook-setup)).
- Auto-membership from the timetable system — students leaving the class are removed automatically next sync.

## When to escalate
Student/staff added or missing from a class → IT ticket; do not add by hand or they\'ll get removed at the next sync.`,
  },

  // ─────────── WORD / POWERPOINT / EXCEL / ONENOTE ───────────
  {
    slug: 'recover-unsaved-word',
    title: 'Recover an unsaved or crashed Word document',
    summary: 'AutoRecover, version history, and the OneDrive timeline.',
    department: null,
    tags: ['m365', 'word', 'recovery'],
    body_md: `## If Word crashed before you could save
1. Re-open Word. The **Document Recovery** pane appears on the left.
2. Click each recovered file to preview, then **Save As** the one you want.

If the pane doesn\'t appear:
1. **File → Open → Recent**.
2. Bottom of the list: **Recover Unsaved Documents**.
3. Pick from \`%localappdata%\\Microsoft\\Office\\UnsavedFiles\`.

## If you saved over a good version with a bad one
For files in OneDrive / SharePoint / Teams:
1. Right-click the file → **Version history**.
2. Pick a previous version → **Restore** (or *Open* to copy bits across).

## Future-proofing
- Keep AutoSave **on** (toggle top-left). Requires the file to live in OneDrive/SharePoint.
- AutoRecover saves every 10 minutes by default — change to 2 in *File → Options → Save*.`,
  },
  {
    slug: 'word-styles-accessibility',
    title: 'Word — use Styles and Headings (and why it matters)',
    summary: 'Headings make documents accessible and tables of contents trivial.',
    department: null,
    tags: ['m365', 'word', 'accessibility'],
    body_md: `## Apply a heading
- Click the line you want as a heading.
- Home ribbon → **Heading 1** for top-level, **Heading 2** for sub-sections, etc.
- Don\'t just make it bold and 18pt — screen readers won\'t recognise that as a heading.

## Why it matters
- **Accessibility**: students using screen readers or *Read Aloud* (View → Immersive Reader) navigate document structure via headings.
- **Navigation**: View → **Navigation Pane** gives a clickable outline.
- **Table of contents**: References → **Table of Contents → Automatic** — auto-generated from your headings.

## Tweaking how headings look
- Right-click the style in the Styles gallery → **Modify**.
- Change font/size/colour/spacing once → applies everywhere.

## Word\'s Accessibility Checker
**Review → Check Accessibility**. Flags missing alt text, low-contrast text, missing headings. Use before you share with parents or students.`,
  },
  {
    slug: 'powerpoint-embed-video',
    title: 'PowerPoint — embed video and use Design Ideas',
    summary: 'Reliable video playback and one-click slide makeovers.',
    department: null,
    tags: ['m365', 'powerpoint', 'multimedia'],
    body_md: `## Embed a local video
1. **Insert → Video → This Device**.
2. Pick the file. PowerPoint embeds the video inside the .pptx — it travels with the deck.
3. Click the video → **Playback** ribbon → set *Start: Automatically* if you want it to play on slide entry.

## Embed a YouTube video
1. **Insert → Video → Online Video**.
2. Paste the YouTube URL.
3. Note: needs internet during the lesson. **Download a backup** for unreliable rooms.

## Compress media before sharing
**File → Info → Compress Media → Standard (480p)**. Often shrinks a 200 MB deck to 30 MB.

## Design Ideas / Designer
Select a slide → **Designer** appears top-right (Insert → Designer if not). Suggests layouts based on your content. Free with M365.`,
  },
  {
    slug: 'powerpoint-presenter-view',
    title: 'PowerPoint — Presenter View on dual monitors',
    summary: 'See your notes and next slide while students see only the slide.',
    department: null,
    tags: ['m365', 'powerpoint', 'presenting', 'classroom'],
    body_md: `## Setup
1. Plug in the projector / second display.
2. **Slide Show** ribbon → tick **Use Presenter View**.
3. *Monitor*: pick the projector as the show display.
4. Press **F5** to start.

## What you see
- Current slide (left).
- Next slide preview (top right).
- Speaker notes (bottom right) — sized via the slider underneath.
- Timer + clock.
- Pen / laser pointer / black-screen toggles in the bottom toolbar.

## Common issue: presenter view appears on the projector
1. During the show: top-left → **Display settings → Swap Presenter View and Slide Show**.
2. Or before starting: Win + P → *Extend* (not *Duplicate*).

## Black screen mid-lesson
Press **B**. Useful when you want students to look at you, not the slide. Press **B** again to resume.`,
  },
  {
    slug: 'excel-freeze-sort-filter',
    title: 'Excel — freeze panes, sort and filter for class lists',
    summary: 'Keep the header row visible while scrolling through marks.',
    department: null,
    tags: ['m365', 'excel', 'classlists'],
    body_md: `## Freeze the header row
1. Click in cell **A2** (or the row below your header).
2. **View → Freeze Panes → Freeze Top Row** (or *Freeze Panes* if you also want column A locked).

## Turn the data into a Table
1. Click any cell in your data → **Insert → Table** → tick *My table has headers* → OK.
2. You now get filter dropdowns on every column for free, and the header row stays visible automatically.

## Sort by a column
- Filter dropdown → *Sort A → Z* (alphabetical) or *Sort smallest to largest* (numeric).

## Filter by a value
- Filter dropdown → tick the values you want shown.
- **Multiple columns**: filters compound (AND), letting you find e.g. all Y10 students with attendance < 90%.

## Don\'t sort just one column
**Always select the whole table before sorting**, or use Tables (which selects automatically). Sorting a single column without the rest is the #1 cause of jumbled mark books.`,
  },
  {
    slug: 'excel-vlookup-xlookup',
    title: 'Excel — XLOOKUP for class list joins',
    summary: 'Match students between two sheets without copy-paste.',
    department: null,
    tags: ['m365', 'excel', 'formulas'],
    body_md: `Use **XLOOKUP** (newer, simpler than VLOOKUP — available in M365).

## Pattern
\`\`\`excel
=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])
\`\`\`

## Example: pull a student\'s form group from a master list
- *Master* sheet, columns: A=StudentID, B=Name, C=FormGroup.
- *Marks* sheet, column A=StudentID. You want column B = FormGroup.

In *Marks!B2*:

\`\`\`excel
=XLOOKUP(A2, Master!A:A, Master!C:C, "Not found")
\`\`\`

Drag down. Done.

## Why XLOOKUP > VLOOKUP
- Returns a useful message when the value isn\'t found (no \`#N/A\`).
- Works left-to-right *and* right-to-left.
- No "column index" magic number to count.

## Still need VLOOKUP?
\`=VLOOKUP(A2, Master!A:C, 3, FALSE)\` returns the 3rd column (FormGroup). Always use \`FALSE\` for exact match.`,
  },
  {
    slug: 'onenote-class-notebook-setup',
    title: 'OneNote Class Notebook — set up for a new class',
    summary: 'Content Library, Collaboration Space, and individual student sections.',
    department: null,
    tags: ['m365', 'onenote', 'classnotebook', 'classroom'],
    body_md: `Class Notebook gives every class three areas:

| Area | Who can edit | Use for |
|---|---|---|
| **Content Library** | Teacher writes, students read | Lesson resources, instructions |
| **Collaboration Space** | Everyone | Group work, brainstorms |
| **Student Sections** | Each student\'s own (only they + teacher see it) | Their work, your feedback |

## Create one
1. Open the **class team** → **Class Notebook** tab → **Set up a OneNote Class Notebook → Blank Notebook**.
2. Confirm the student list (auto-pulled from team membership).
3. Pick which default sections to create (Handouts, Class Notes, Homework, Quizzes are sensible defaults).
4. **Create**.

## Day-to-day
- Open from Teams (in-browser) or pin to the desktop OneNote app for offline use.
- Drop new resources into Content Library — students see them next sync.
- Use **Distribute Page** to push a worksheet into every student section at once (see [Distribute pages](/kb/onenote-distribute-pages)).`,
  },
  {
    slug: 'onenote-distribute-pages',
    title: 'OneNote — distribute a page to every student',
    summary: 'Push a worksheet into all student notebooks in one click.',
    department: null,
    tags: ['m365', 'onenote', 'classnotebook'],
    body_md: `## Distribute one page
1. In your **_ContentLibrary** or *Teacher-Only* section, build the worksheet page.
2. Class Notebook ribbon → **Distribute Page**.
3. Pick the destination section (e.g. *Homework*) → **Distribute**.
4. Each student gets a copy in their section. They can edit theirs without affecting yours or anyone else\'s.

## Distribute to specific students
**Distribute Page → Individual** — tick the students. Useful for differentiation or catch-up tasks.

## Lock the page after a deadline
Class Notebook ribbon → **Manage Notebooks → Lock Collaboration Space** (whole space) — or use Insights to track who\'s edited and copy a finalised version into Content Library to "freeze" it.

## Common pitfall
You edit the master page **after** distributing — student copies are *not* updated. Re-distribute to overwrite, or use a *link* in the Content Library so the master is the single source of truth.`,
  },
  {
    slug: 'forms-quiz-autograde',
    title: 'Microsoft Forms — create an auto-marked quiz',
    summary: 'Build, share, and review responses with instant marking.',
    department: null,
    tags: ['m365', 'forms', 'assessment'],
    body_md: `## Build it
1. <https://forms.office.com> → **New Quiz**.
2. Title + description.
3. **+ Add new** → choose question type (*Choice*, *Text*, *Rating*, etc.).
4. For each question: tick the **correct answer**, set **Points**.
5. Optionally add **Math** mode (Insert → Math) for proper formula rendering.

## Share with your class
1. **Collect responses** (top right).
2. Choose *Only people in my organisation*.
3. Copy link / embed in Teams / generate QR code.

## Live results
- **Responses** tab: real-time chart per question.
- **Open in Excel** for marks export.
- **Review answers** to mark text-response questions and write feedback.

## Tips for teachers
- Tick **Shuffle questions** to discourage copying.
- Tick **Show progress bar** to reduce student anxiety.
- Use **Branching** for differentiated paths (a wrong answer can route to a remediation slide).`,
  },
  {
    slug: 'clipchamp-screencast-lesson',
    title: 'Record a screencast lesson with Clipchamp or PowerPoint',
    summary: 'Two free, school-licensed ways to record narrated lessons.',
    department: null,
    tags: ['m365', 'clipchamp', 'powerpoint', 'lesson-recording', 'flipped'],
    body_md: `## Option 1 — PowerPoint (slide-based lessons)
1. Open the deck → **Slide Show → Record**.
2. Pick which monitor and tick *Camera* if you want your face in the corner.
3. Use the pen/laser tool while narrating; PowerPoint records each slide separately.
4. Stop → **File → Export → Create a Video** → MP4 → save to OneDrive.
5. Share the OneDrive link, **not** the .pptx — students get a clean video.

## Option 2 — Clipchamp (anything else)
1. Open **Clipchamp** from Start.
2. **Record & create → Screen and camera**.
3. Pick screen + mic + (optional) webcam → record.
4. Trim mistakes on the timeline.
5. **Export → 1080p**. Save to OneDrive → share link.

## Where to host the video
- *OneDrive* link works fine for ≤30 students.
- For year-group-wide content, upload to **Stream** (<https://stream.office.com>) — better playback, captions, and analytics.

## Captions
Stream auto-generates captions. After upload: video → *Captions* → review/edit. Required for accessibility.`,
  },

  // ─────────── HARDWARE ───────────
  {
    slug: 'laptop-wont-power-on',
    title: 'Laptop won\'t power on',
    summary: 'Triage a "dead" laptop in 5 minutes.',
    department: 'IT',
    tags: ['hardware', 'power', 'troubleshooting'],
    body_md: `## Step 1 — confirm power delivery
1. Plug into a **wall socket you know works** (try a kettle in it first).
2. Use the **original charger** if you have it. Cheap USB-C chargers often don\'t deliver enough wattage to wake a flat battery.
3. Check the charger LED is on, and the cable isn\'t kinked or burnt where it meets the brick.

## Step 2 — drain residual charge
1. Unplug the charger.
2. Hold the **power button for 30 seconds**.
3. Plug back in, wait 1 minute (leaves time for a flat battery to take some charge), then press power.

## Step 3 — listen and look
- Any LEDs on the laptop body? Fan noise? Hard-drive activity? Note what you see/hear for the IT ticket.
- Connect an **external monitor** (HDMI). If the external shows a picture, the laptop is alive — it\'s a screen problem, not a power one.

## When to escalate
None of the above works → IT ticket. Mention what you tried; we\'ll book a loaner so you\'re not without a laptop while we diagnose.`,
  },
  {
    slug: 'battery-not-charging',
    title: 'Battery won\'t charge or drains too fast',
    summary: 'Charger checks, battery report, and when to request a replacement.',
    department: 'IT',
    tags: ['hardware', 'battery', 'power'],
    body_md: `## Quick checks
1. Try a **different charger** (any colleague\'s same-brand will do). Eliminates the charger as the variable.
2. **Different wall socket** (avoid the daisy-chained extension cord under your desk).
3. Unplug the laptop and gently **wiggle** the charging port while plugged in. If charging only works at certain angles, the port is loose — IT ticket; the laptop needs a board-level repair.

## Generate a battery report
PowerShell **as administrator**:
\`\`\`powershell
powercfg /batteryreport /output "$env:USERPROFILE\\Desktop\\battery.html"
\`\`\`
Open the HTML on your desktop. Look at *Design capacity* vs *Full charge capacity*:
- Within 80% → battery is healthy; runtime issues are software-related (close OneDrive sync, dim screen).
- Below 60% → battery is degraded. Attach the report to an IT ticket and request a replacement.

## "Plugged in, not charging"
- Laptop is too hot or too cold (some models pause charging outside 5–35 °C). Move to a normal-temperature room.
- Charger wattage too low. The sticker on the brick should match the laptop\'s requirement (typically 65 W or 90 W).`,
  },
  {
    slug: 'laptop-overheating',
    title: 'Laptop is overheating or fan is loud',
    summary: 'Vent dust, thermal apps, and when to send it for a service.',
    department: 'IT',
    tags: ['hardware', 'overheating', 'fan'],
    body_md: `## Quick wins
1. **Use it on a hard, flat surface.** Sofas, beds and laps cover the underside vents — fan can\'t intake cool air.
2. **Close OneDrive, Teams and any browser tabs you don\'t need.** These are usually the top CPU consumers on a teacher laptop.
3. **Update Windows.** Many fan-control fixes ship in updates.

## Clean the vents
- Use a **can of compressed air** (available in IT). Hold the fan blades still with a cocktail stick (don\'t let them spin freely under air pressure — it can damage the bearing).
- Spray short bursts into the side and bottom vents.
- Don\'t use a vacuum cleaner — static can fry components.

## Diagnose with Task Manager
Ctrl+Shift+Esc → **Performance → CPU**. If it\'s pinned at 100% with no obvious app, switch to **Processes** → sort by CPU. Take a screenshot for your IT ticket.

## When to escalate
Overheating despite cleaning + low CPU → thermal paste likely needs reapplying. Raise an IT ticket; we book a service slot, usually 2–3 days.`,
  },
  {
    slug: 'keyboard-keys-not-working',
    title: 'Some keyboard keys aren\'t working',
    summary: 'Sticky keys, Filter Keys, and the on-screen keyboard test.',
    department: 'IT',
    tags: ['hardware', 'keyboard'],
    body_md: `## Step 1 — software or hardware?
- Open **On-Screen Keyboard** (Start → search *osk*).
- Click each "broken" key with the mouse. Does it type? **Yes** = hardware. **No** = software/setting.

## Software fixes
- Settings → Accessibility → **Keyboard** → turn off **Sticky Keys**, **Filter Keys**, **Toggle Keys**. Filter Keys is the usual culprit — it ignores brief key presses.
- Settings → Time & language → **Language → Add a language** — make sure your keyboard is set to **English (UK)** or **English (US)**, whichever matches your physical keyboard.
- Update the keyboard driver: Device Manager → Keyboards → right-click → Update driver.

## Hardware fixes
- Power off, gently flip the laptop and tap the back to dislodge crumbs. Hold the keys at an angle and brush with compressed air.
- For sticky keys (post-spill), the keyboard probably needs replacing — IT ticket. Don\'t try to lever keycaps off; modern laptop keys clip in fragile ways.

## Workaround
Plug in a **USB keyboard** while waiting for repair.`,
  },
  {
    slug: 'touchpad-erratic',
    title: 'Touchpad is disabled, jumpy, or won\'t click',
    summary: 'Toggle, sensitivity, and palm-rejection settings.',
    department: 'IT',
    tags: ['hardware', 'touchpad'],
    body_md: `## Touchpad disabled?
- Look for an Fn key on F5–F9 with a touchpad icon — toggle it.
- Settings → Bluetooth & devices → **Touchpad** → switch it **On**.
- Some laptops disable the touchpad automatically when a USB mouse is plugged in. Unplug the mouse and try again.

## Cursor jumping while you type
- Settings → Bluetooth & devices → Touchpad → expand **Taps** → set **Touchpad sensitivity** to *Low* or *Most sensitive (palm rejection)*.
- Disable *Tap to click* if your palm keeps clicking.

## Multi-finger gestures broken
Settings → Touchpad → **Reset** (under Advanced gestures). Then re-enable the gestures you want.

## Hardware
- Clean the surface with a slightly damp microfibre. Skin oil makes precision tracking patchy.
- If the bottom-left corner won\'t click but the rest does, the **click bar** is loose — IT ticket.`,
  },
  {
    slug: 'external-monitor-not-detected',
    title: 'External monitor / projector not detected',
    summary: 'Detect, cable, and resolution checks.',
    department: 'IT',
    tags: ['hardware', 'display', 'classroom'],
    body_md: `## Step 1
**Win + P** → choose **Extend** or **Duplicate**. Sometimes Windows just needs the prompt.

## Step 2 — cable / port
- Try a **different cable** (HDMI cables fail much more often than ports do — most classrooms have a spare in the AV cupboard).
- Try a different port on the laptop (USB-C → HDMI adapter, vs the laptop\'s built-in HDMI).
- If using a docking station, **disconnect and reconnect the dock** — they often need a kick.

## Step 3 — display side
- Power-cycle the monitor / projector at the wall.
- Set the input source on the display\'s remote/menu to match the cable you\'re using (HDMI 1 vs HDMI 2 is a common gotcha).

## Step 4 — Windows side
Settings → System → Display → **Detect**.

## Step 5 — driver
Device Manager → **Display adapters** → right-click your GPU → **Update driver**.

## When to escalate
Other people use the same projector fine and only your laptop fails → IT ticket; bring it to the help desk so we can test alongside.`,
  },
  {
    slug: 'usb-device-not-recognized',
    title: 'USB device not recognised',
    summary: '"Unknown USB device" and how to get it working again.',
    department: 'IT',
    tags: ['hardware', 'usb'],
    body_md: `## First, try the obvious
1. Try a **different USB port**. The right-hand side ports often live on a separate controller from the left.
2. Try a **different cable** if it\'s a peripheral with a removable cable (e.g. printers, external drives). Charging-only cables are a common trap.
3. Try the device on **another laptop**. Confirms whether the device or your laptop is at fault.

## Driver fix
1. Device Manager → look for a **yellow ! icon** under *Universal Serial Bus controllers* or *Other devices*.
2. Right-click → **Uninstall device** → tick *Delete the driver software for this device* if the option appears.
3. Unplug, wait 10 seconds, plug back in. Windows reinstalls the driver from scratch.

## Power management gotcha
Device Manager → expand *Universal Serial Bus controllers* → for each *USB Root Hub* → **Properties → Power Management → uncheck "Allow the computer to turn off this device to save power"**. Resolves the "device worked, then died after sleep" pattern.

## When to escalate
Multiple known-good USB devices fail on multiple ports → motherboard issue, IT ticket.`,
  },
  {
    slug: 'audio-no-sound',
    title: 'No sound from speakers or wrong output device',
    summary: 'Volume mixer, output picker, and driver reset.',
    department: 'IT',
    tags: ['hardware', 'audio'],
    body_md: `## Quick checks
1. **Output device**: click the speaker icon in the system tray → arrow next to the volume slider → pick the device you actually want (Speakers, the projector via HDMI, your headset).
2. **Volume mixer**: right-click speaker icon → **Open Volume Mixer** → make sure the app you\'re using isn\'t individually muted.
3. **Headphone jack**: unplug and re-plug. The detection switch can stick.

## Driver reset
1. Device Manager → *Sound, video and game controllers*.
2. Right-click your audio device → **Uninstall device** (don\'t tick "Delete driver" unless step 3 fails first).
3. Top menu → **Action → Scan for hardware changes**. Driver reinstalls.

## HDMI audio works in classroom but not staffroom monitor
Most projectors have audio over HDMI; many monitors don\'t. Plug headphones / speakers into the laptop\'s 3.5 mm jack, or use a USB speaker for those rooms.

## When to escalate
No audio device shows in *Output* at all (not even *Speakers*) → IT ticket; sound chip may have failed.`,
  },
  {
    slug: 'webcam-not-working',
    title: 'Webcam not working',
    summary: 'Privacy switches, app permissions, and driver reinstall.',
    department: 'IT',
    tags: ['hardware', 'webcam', 'teams'],
    body_md: `## Step 1 — physical privacy switch
Many school laptops have a **slider above the camera** or a function-key shortcut (an icon on F4 or F10). Make sure it\'s in the *open* / unlocked position.

## Step 2 — Windows privacy permissions
Settings → Privacy & security → **Camera** →
- *Camera access* = **On**.
- *Let apps access your camera* = **On**.
- Scroll down — make sure **Microsoft Teams** is **On**.
- Scroll further to *desktop apps* and ensure that\'s also **On** for new Teams.

## Step 3 — test in the Camera app
Start → search *Camera*. Does it show video?
- **Yes** → problem is app-specific. Sign out / restart Teams.
- **No** → continue below.

## Step 4 — driver reinstall
Device Manager → *Cameras* → right-click your webcam → **Uninstall device** → reboot. Driver reinstalls automatically.

## Step 5 — close other apps holding the camera
Only one app can use the camera at a time. Close Snipping Tool, Zoom, OBS, browser tabs, and re-open Teams.

## When to escalate
Camera app shows *"We can\'t find your camera"* even after driver reinstall → IT ticket; webcam module may have failed.`,
  },
];

console.log(`Seeding ${ARTICLES.length} articles…`);

// Clear existing seeded articles (matched by slug) so we can plain-insert.
// onConflict path hits a PostgREST schema cache bug right after migration.
const slugs = ARTICLES.map((a) => a.slug);
const { error: delErr } = await supabase
  .from('kb_articles')
  .delete()
  .in('slug', slugs);
if (delErr) {
  console.error('Pre-clear failed:', delErr.message);
  process.exit(1);
}

// Insert in batches of 25
const CHUNK = 25;
let success = 0;
for (let i = 0; i < ARTICLES.length; i += CHUNK) {
  const batch = ARTICLES.slice(i, i + CHUNK).map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    body_md: a.body_md,
    department: a.department ?? 'IT',
    tags: a.tags,
    status: 'published',
  }));
  const { error } = await supabase.from('kb_articles').insert(batch);
  if (error) {
    console.error(`Batch ${i}–${i + batch.length}:`, error.message);
    process.exit(1);
  }
  success += batch.length;
  console.log(`  ✓ ${success}/${ARTICLES.length}`);
}
console.log('Done.');
