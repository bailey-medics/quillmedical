# Quill update for EoEETA, 31 August 2026

Covering work from 23 July to 31 August 2026.

- Added safety checks so user records cannot be deleted or changed by
  accident. A change like that now has to be approved first.

- Made releases safer, including database updates. Every update is checked
  before it goes live, and can be undone quickly if something goes wrong.

- Made sure updates cannot interrupt or break the app for someone who is
  using it at the time.

- Cleared a backlog of security updates to the outside software Quill relies
  on, and set the routine ones to happen automatically.

- Tidied up the underlying data setup so it starts from a clean, consistent
  base.

- Improved the automated testing so every change is properly tested before it
  goes in.

- Fixed problems users would notice: the app on iPhone home screens, forms
  refreshing part-way through, and a confusing error message.

- Planned the next stage of the learning centre, including secure video that
  only logged-in users can watch.
