# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.7.2] — 2026-10-12

### Added

- **5% original-audio volume** option while translated speech plays, between mute (0%) and quiet (15%).
- Preserves all existing 0%, 15% and 30% levels. The level is saved and restored from extension settings, and honored by both the background validation and offscreen gain scheduler.
- Maintains the matching-source-language exception from 1.7.1: when source speech is already in the target language and echo is off, the original remains at 100%.

## [1.7.1] — 2026-10-12

### Fixed

- When **Echo matching audio** is disabled and Gemini detects that the incoming speech is already in the target language, **Original sound between translated speech** now preserves the source at 100% instead of ducking it.
- Existing scheduled ducking is cancelled when the source switches into the target language; when a different source language is detected, the chosen 0% / 15% / 30% ducking applies to subsequent translated voice.
- Uses Gemini's input transcription language metadata, including while the CC subtitle panel is minimized. If the model does not report a language, the previous audio mixing behavior is kept.

## [1.7.0] — 2026-10-12

### Added

- **Pause/resume translated speech** with an accessible circular control directly to the left of the X in expanded captions.
- In minimized mode, a single compact shared carrier shows **[ ‖ CC ]** while speaking and **[ ▶ CC ]** when paused.
- The control appears on the first translated audio packet. Its state is synchronized with the offscreen audio process and restored across tab navigation.

### Behavior

- Pausing mutes only synthesized translation audio. Transcription and streaming to Gemini continue; missed speech is **not queued for replay**, keeping the translation live.
- The playback AudioContext clock remains active to avoid accumulated latency.
- When the optional original-audio ducking feature is enabled, pausing translation restores original tab audio.

## [1.6.0] — 2026-10-09

### Added

- **Optional English/Hungarian filler cleanup in live subtitles**: removes common hesitation sounds (for example “um”, “uh”, “ööö”, “izé”) and clearly sentence-initial, comma-separated discourse markers (such as “you know,”, “szóval,”). Applies to on-screen source and translated captions only. Speech synthesis is not affected.
- **Optional dynamic original-audio playback**: play original tab audio at full volume between translated speech segments; automatically reduce it to a selectable 0%, 15%, or 30% while translated voice plays, with smooth ramps.
- Both features can be enabled independently in Options; both default to off to preserve the previous experience.
- Added automated regression tests for bilingual filler cleanup and original-audio ducking timing.

### Notes

- Audio ducking is driven by actual playback of translated speech, not by source-language speech detection or music/speech source separation. Original speech may be audible before a delayed translation begins.
- The Gemini Live Translate API does not currently expose a supported way to rewrite the generated spoken translation with a filler-free prompt. Only the displayed transcript is filtered.

## [1.5.0] — 2026-10-08

### Added

- A close button on the live subtitle panel minimizes it to a small floating **CC** button in the bottom-right corner.
- Clicking **CC** restores the full subtitle panel without restarting the audio translation.
- Responsive positioning for narrow viewports and accessible keyboard/ARIA labeling.

### Improved

- While minimized, subtitle fragments are no longer forwarded to the page or written to its DOM, reducing unnecessary UI work. Spoken translation continues normally.
- Minimized state survives same-tab navigations when Chrome permits overlay reinjection.
- A new translation session starts with the subtitle panel expanded.
- The homepage link now points to the maintained fork.

### Compatibility

- Chrome Manifest V3, no new browser permissions and no new external services.
- The audio capture, translation API, and settings behavior are unchanged.

## [1.4.0] — 2026-07-26

### Changed

- **Renamed to "Live Translate."** The product name no longer carries a
  third-party model name, avoiding any suggestion of an official endorsement.
- **The entire interface is now in English.** Every user-facing string was
  converted: the extension name, description and toolbar tooltip, the settings
  page, the subtitle overlay statuses, and all error messages raised by the
  service worker and the offscreen document.
- The settings page now declares `lang="en"`, so screen readers use the correct
  pronunciation.
- Added `homepage_url` pointing at the project repository.

### Documentation

- README rewritten in English, with a permissions rationale table, the full list
  of available settings, and a project-structure overview.
- Added an MIT license.

## [1.3.0]

Initial public release.

- One-click real-time translation of the audio playing in the active tab, with a
  spoken translation plus subtitles showing both the translation and the original
  transcript.
- 70+ target languages.
- Selectable playback smoothness (`fast` / `balanced` / `smooth`) backed by an
  adaptive jitter buffer that grows on network instability and shrinks again once
  the connection is steady.
- Optional verbatim echo when the source audio is already in the target language.
- Automatic reconnection, up to four attempts.
