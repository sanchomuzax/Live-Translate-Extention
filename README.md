# 🎧 Live Translate

**Translate the audio of any Chrome tab in real time — one click, no setup rituals.**

Watching a Coursera lecture, sitting in a Zoom Web meeting, or catching a webinar in a language you don't speak? Click the extension icon once. You will hear a spoken translation and see live subtitles at the bottom of the page, within about a second.

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="Assets/photo_2026-07-26_21-47-33.jpg" alt="Live subtitles overlaid on a YouTube video while its audio is translated in real time">
    </td>
    <td width="50%" valign="top">
      <img src="Assets/photo_2026-07-26_21-38-24.jpg" alt="The Live Translate settings page, showing the API key field, target language, playback smoothness, and echo option">
    </td>
  </tr>
  <tr>
    <td align="center"><sub>Translating live, with subtitles</sub></td>
    <td align="center"><sub>Settings</sub></td>
  </tr>
</table>

- ⚡ **One click** — no model picker, no tab-sharing dialog, no per-session configuration
- 🗣️ **Listen and read** — synthesized speech plus subtitles showing both the translation and the original transcript
- 🌍 **70+ target languages** — Vietnamese by default, changeable at any time
- 🎚️ **Tunable latency** — trade delay against smoothness to match your connection
- 💸 **Free to run** — uses Google's free tier; no credit card required
- 🔒 **No data collection** — no analytics, no intermediary server, no third parties

Powered by the Live Translate API from Google AI Studio.

> **On languages:** the interface is in English — the translation is whatever you want it to be. Choose from 70+ target languages in the settings; Vietnamese is simply the default, not a limit.

---

## 📥 Installation (about 3 minutes)

### Step 1 — Download the extension

For a tested and packaged version, download the **live-translate-v1.6.0.zip** asset from the [latest GitHub release](https://github.com/sanchomuzax/Live-Translate-Extention/releases/latest), then **extract** the archive. Alternatively, use **Code → Download ZIP** and extract it.

> Keep the extracted folder. Chrome loads the extension directly from that location — deleting or moving it will break the extension.

### Step 2 — Load it into Chrome

1. Open a new tab and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the extracted folder
4. Pin the extension to your toolbar for quick access (🧩 icon → pin)

### Step 3 — Get a free API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and click **Create API key**. Signing in with a Google account is all it takes — **no payment method required**.
2. Copy the key.
3. Click the extension icon. The settings page opens automatically on first run. Paste the key, verify it, and save.

That's it. 🎉

---

## ▶️ Usage

| Action | How |
|---|---|
| **Start translating** | Open the tab that is playing audio, then **click the extension icon**. The badge reads `ON`, the original audio is muted, and the translated speech plays with subtitles. |
| **Stop** | **Click the icon again.** The original audio returns to normal. |
| **Switch tabs** | Just click the icon in the new tab — the previous session stops on its own. |
| **Hide / show subtitles** | Click **×** in the overlay to collapse it to a bottom-right **CC** button; click **CC** to restore it. The spoken translation continues. |
| **Change settings** | Right-click the icon → **Options**. |

### Subtitles: minimize and restore

To keep the page clear, click **×** on the top-right corner of the subtitle panel. It shrinks to a **CC** icon floating in the bottom-right corner. Tap **CC** to reopen the subtitles. Audio translation keeps running while the panel is minimized. Hidden subtitles are not sent to the page for rendering, which reduces unnecessary UI processing. On the next translation session the full panel opens again.

### Available settings

| Setting | What it does |
|---|---|
| **API key** | Your Google AI Studio key. Includes a built-in check so you can confirm the key works before saving. |
| **Target language** | 70+ languages. Defaults to Vietnamese. |
| **Playback smoothness** | Three profiles — *fast* (lowest delay, more prone to dropouts on a weak connection), *balanced* (recommended), and *smooth* (roughly one extra second of buffer, fewest interruptions). |
| **Echo matching audio** | When the source audio is already in your target language, choose whether to re-read it verbatim or stay silent (silent by default). |
| **Remove fillers from subtitles** | Optional cleanup for common English/Hungarian hesitation words, e.g. “um”, “uh”, “ööö”, “izé”, and comma-separated introductory phrases. Affects subtitles only, **not translated speech audio**. Disabled by default. |
| **Original sound between translated speech** | Optional dynamic volume mixing: hear the original tab sound/music at full volume between translated voice segments, duck to 0%, 15%, or 30% while translated voice plays. Disabled by default. |

---

### Hearing the source between translated speech

In **Options**, enable **Let original sound and music play between translated speech**. The captured tab audio will be audible during gaps in the *translated* voice and will fade down while the translation speaks. Choose how much of the original audio should remain during translation (0%, 15%, or 30%).

This is based on translated speech playback, **not** a music-separation or voice-activity-detection model. An untranslated source-language speaker may be heard while the translation is delayed or silent, and music playing underneath translated speech is reduced along with the rest of the original audio. If you want only translated speech, leave the option off.

### Subtitle hesitation cleanup

Enable **Remove hesitation and filler words from subtitles** in **Options** to hide common English/Hungarian fillers and clearly introductory discourse markers in the source and translated subtitles. The filter does not alter the Google-generated voice; the translation model does not support a custom speech-cleanup instruction. Meaningful words, including some contextual uses of “so”, “like”, “szóval”, and “tudod”, are preserved when they are not in the specific introductory filler form, but occasional false positives are possible.

## 💰 Cost

The Live Translate model has a **free tier that costs nothing and requires no credit card** — the same tier you get using [aistudio.google.com/live](https://aistudio.google.com/live) directly.

Charges (~$0.037 per minute of audio) apply only if you have enabled billing on your Google Cloud account **and** exceed the free-tier quota.

⚠️ **Free-tier caveat:** Google may use free-tier data to improve its products. Do not use this extension for confidential material.

---

## 🔒 Privacy

- Your API key is stored **only on your machine** via `chrome.storage.local`, and is transmitted only to Google's API endpoint over TLS.
- The extension does **not** run scripts on the pages you browse. Subtitles are injected solely into the tab where you clicked the icon, using the narrowly scoped `activeTab` permission.
- No analytics, no remotely hosted code, no third-party services. The complete source is in this repository and is short enough to audit yourself.

### Permissions and why they are needed

| Permission | Purpose |
|---|---|
| `tabCapture` | Captures the audio stream of the tab you explicitly activate. This is the extension's core function. |
| `offscreen` | Audio capture and playback require `AudioContext`, which service workers cannot use. An offscreen document handles PCM processing. |
| `storage` | Persists your API key and preferences locally. |
| `activeTab` | Limits page access to the single tab you act on, avoiding broad host permissions. |
| `scripting` | Injects the subtitle overlay into that one tab, on demand. |

---

## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| Badge shows `ERR` | Browser-internal pages (`chrome://`, the Chrome Web Store) cannot be captured. Try an ordinary website. |
| Connection error asking you to re-check the API key | Open the settings page and run the key check. Create a new key if it fails. |
| Subtitles appear but no translated speech | Check your system volume, then click the icon twice (stop, then start again). |
| Subtitles vanish after navigating within the tab | Audio translation continues. Click the icon twice to restore the overlay. |
| Repeated reconnection messages | An unstable network. The extension retries automatically, up to four times. |
| Choppy or dropped words | Open **Options** and switch playback smoothness to *smooth*. |

---

## License

[MIT](LICENSE) — free to use, modify, and distribute. Copyright © 2026 Long Lagon.
