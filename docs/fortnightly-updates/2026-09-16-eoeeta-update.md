# Quill update for EoEETA, 16 September 2026

Dear all,

Below is the second update of the Teaching Platform work (1-16th September):

- Currently building the secure video system for the learning centre. Videos can be uploaded, converted into several quality levels, given automatic subtitles that an administrator can correct, and only played to people who are logged in and entitled to see them.
- Added a video quality selector so learners on a slow connection can still watch, and stopped the EoEETA teaching module appearing to users until its video(s) are genuinely ready to play.
- Rebuilt how access is decided. Rather than a single "seniority" setting, what someone can do now follows from the specific responsibilities they hold. This is more precise, easier to audit, and much harder to get wrong.
- Tightened access so admins of the EoEETA organisation can only see users, sites and content belonging to their own organisation, and vice versa.
- Added round-the-clock monitoring. The system now watches itself for outages, errors and running out of disk space, and raises an alert by Slack (like WhatsApp), SMS text message and, for a sustained outage, a phone call to myself, even out of hours.
- Added error reporting from the browser, so a problem a user hits is recorded with enough context to fix it, without recording anything identifiable about the user.
- Added simple, privacy-respecting usage counts so we can see which parts of the platform are actually used. Users can opt out in their settings if they would like to.
- Published the real cookie and privacy policies on the public site, replacing the placeholders.
- Continued clearing third-party security updates as they arrive, and improved the automated testing and release process further.

Many thanks

Mark
