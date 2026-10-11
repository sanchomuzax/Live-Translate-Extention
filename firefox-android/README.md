# Live Translate — Firefox Android experimental (1.6.2)

This is an **experimental adaptation**, NOT equivalent to the Chrome extension.

## What it can attempt

- Capture audio from a **currently playing HTML5 `<audio>` or `<video>`** element in the active page using `captureStream()` / `mozCaptureStream()`.
- Forward PCM to Google's Gemini 3.5 Live Translate Preview and play synthesized translation.
- English/Hungarian subtitle filler cleanup and a dismissible floating CC button.
- Optional playback of original sound between translated speech segments.

## Known limitations

- Firefox Android has no Chrome-compatible `tabCapture` or `offscreen` APIs. This implementation cannot capture arbitrary tab/system audio. Content inside inaccessible cross-origin frames, DRM playback, and media without accessible audio tracks may fail.
- Whether muting an HTMLMediaElement leaves `captureStream` audio intact varies with Gecko's implementation/version and MUST be tested on the real device.
- The translation playback buffer is simpler than the Chrome version and may be choppier.
- Media capture uses a 100ms AudioWorklet. Some pages may reject the worklet resource or disallow capture; this is not yet field-tested.
- The original media element is muted while translation runs and its mute state is restored when translation stops. If the tab crashes, refreshing the page restores its normal state.
- Only an explicitly started page is injected; the browser action must be clicked while playback is active.

## Data handling and required disclosures

The extension transfers the selected media element's **audio content** to Google's Gemini Live API for translation. An API key is sent to Google for authorization. If the selected media includes a call or meeting, personal communications could be processed. No audio is sent to the fork maintainer and there is no analytics or intermediary server. Data may be handled by Google according to the selected Google AI Studio project/tier terms.

## Installation on Firefox Android Release

The produced archive is **unsigned**, so Firefox's **Install extension from file** menu WILL reject it even if the ZIP itself is valid. Mozilla signing is required. **Do not rename the ZIP to XPI and expect it to install**.

1. Create a Mozilla Add-ons developer account at https://addons.mozilla.org/developers/.
2. In the Developer Hub submit this package as **On your own / unlisted** for signing (choose Android support). Mozilla reviews and signs the extension, returning a signed `.xpi`.
3. Save the signed XPI on the phone and use **Settings → Install extension from file** in ordinary Firefox Android.
4. In extension settings configure your Gemini API key and target language. Never share the key in chat.

Or obtain your Mozilla Add-ons signing credentials and run `web-ext sign --channel=unlisted` locally. Do not give anyone your API secret.

## Building the upload archive

The files in the ZIP root must include `manifest.json` and all `.js`/`.css`/`.html` files. This experimental package is already prepared as a ZIP for AMO submission. It is not Chrome compatible.
