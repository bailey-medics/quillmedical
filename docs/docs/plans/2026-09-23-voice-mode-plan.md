# VoiceMode plan

Set up [VoiceMode](https://voicemode.dev) so a developer can hold a spoken
conversation with Claude Code away from the keyboard, including in a car on
headphones. The brief arrived as a pasted proposal with seven items: check the
upstream docs first, check and install prerequisites on this Intel MacBook and
say whether local speech models would be slow on it, install the plugin at
user scope, make `bm_george` the voice with three others to audition, write
spoken-reply rules that apply only when voice is in use, produce an in-car
test checklist, and document it all for other developers.

As of 23 September 2026 the first four are done and a full spoken exchange
works from a Claude Code session, with every byte of audio staying on the
machine: Claude speaks in `bm_george` through Kokoro, a Bluetooth headset is
heard, and Whisper transcribes it correctly. The verdict from the first real
conversation was "slow, but useful, potentially", and the numbers in Phase 5
say why both halves of that are fair. The install turned up nine things the
documentation does not mention, most of them specific to an Intel Mac in 2026;
they are recorded in the step where each was hit, because that order is the
troubleshooting guide.

## Phase 1: Check the brief against the current docs

- [x] **Read the README and getting started guide before running anything.**
      The brief's fallback route was
      `claude mcp add --scope user voicemode -- uvx --refresh voice-mode`; the
      README now gives
      `claude mcp add --scope user voicemode -- uvx --refresh --from voice-mode voicemode-mcp-launcher`.
      The package is still `voice-mode` but the executable has become a
      launcher, so the old form installs a server that does not start. The
      plugin route in the brief is unchanged and still correct.

- [x] **Find the real voice setting rather than guessing it.** There is no
      single "default voice". VoiceMode reads an ordered preference list,
      `VOICEMODE_VOICES="bm_george,bm_lewis"`, left to right, and uses the
      first voice the answering endpoint has. Reordering the list is the whole
      operation, which suits auditioning better than a default would. A
      separate `VOICEMODE_KOKORO_DEFAULT_VOICE` appears in the Kokoro guide;
      the preference list is the one that governs what is spoken, and mixing
      the two invites confusion.

- [x] **Check the four requested voices exist.** The Kokoro setup guide lists
      only `bm_george` and `bm_lewis` as British male voices, and the first
      draft of this plan said `bm_daniel` and `bm_fable` did not exist. The
      running Kokoro v1.0 pack serves 72 voices including all four, plus
      `bf_alice`, `bf_emma`, `bf_isabella` and `bf_lily`. The documentation is
      behind the model: check `/v1/audio/voices` on the running server, not a
      list in prose, this one included.

- [x] **Work out what "the cloud fallback" actually is.** VoiceMode has no
      provider setting. It has two ordered endpoint lists, defaulting to
      `VOICEMODE_STT_BASE_URLS="http://127.0.0.1:2022/v1,https://api.openai.com/v1"`
      and the same shape for TTS on port 8880. Local is tried first; OpenAI is
      merely the second entry. Any server speaking `/v1/audio/transcriptions`
      and `/v1/audio/speech` can replace it, and `OPENAI_API_KEY` is only read
      when a request reaches OpenAI's host, so a configuration that never
      lists it never needs one. "Local or cloud" is therefore a false choice:
      a self-hosted Whisper on a machine with a GPU is a third option.

- [x] **Check whether configuration can be user-wide.** The getting started
      guide documents a per-project `.voicemode.env`, which made "one
      configuration for both repositories" look like a shell-profile job. The
      install showed better: `voicemode config set KEY value` writes to
      `~/.voicemode/voicemode.env`, read by every session regardless of
      project, and `voicemode config list` names the keys. Every setting in
      this plan lives there.

- [x] **Check what Claude Code already does.** It now ships `/voice`
      dictation: push-to-talk, streamed to Anthropic for transcription, needs
      a claude.ai login rather than an API key (this account qualifies),
      costs no tokens, and stops on its own after fifteen seconds of silence.
      It is unavailable in cloud and SSH sessions, and it only transcribes.
      Claude cannot speak: there is no text-to-speech anywhere in the Claude
      API, and Anthropic's own consumer voice mode uses ElevenLabs. So a
      speaking engine is needed whatever else is chosen, and that is the one
      job VoiceMode cannot be replaced for.

- [x] **Survey the alternatives.** The Claude app's voice mode is exactly the
      experience wanted, on every plan, and is chat only: "In Claude Cowork
      and Claude Code, dictation is available but voice mode isn't", and the
      feature request for Claude Code was closed as not planned. Remote
      Control puts a local session on the phone with no voice either way.
      Happy Coder is the closest match, an open-source phone app over a local
      session with a hands-free ElevenLabs voice agent, at a subscription and
      with a third party hearing the cabin. VoiceBridge is VoiceMode by
      another route with the same Intel problem. mcp-voice-hooks uses the
      browser's speech recognition and synthesis, no models or keys, but no
      Kokoro voices. Every laptop option assumes the MacBook is in the car;
      Happy and Remote Control assume it is at home. The brief does not say
      which, and that decides more than any tool does.

## Phase 2: Prerequisites on this machine

- [x] **Record what the machine is.** Intel Core i9-9880H, `x86_64`, 32 GB,
      260 GB free. Two GPUs, an AMD Radeon Pro 5500M and Intel UHD 630, both
      with Metal 3, which matters later and not helpfully. macOS 26.6.2 with
      Command Line Tools 26.2. Homebrew 7.0.6, uv 0.10.10, Python 3.13 and
      3.14 both present. Claude Code 2.1.246 with no user-scope MCP servers.
      FFmpeg and PortAudio absent.

- [x] **Install PortAudio.** `brew install portaudio` worked; a bottle still
      existed.

- [x] **Try to install FFmpeg from Homebrew, and understand why it fails.**
      Homebrew has treated Intel Macs as Tier 3 since August 2025: no bottles
      are built, so `brew install ffmpeg` compiles its whole dependency tree
      from source. The build died on the first C++ package, `ninja`, with
      `fatal error: 'vector' file not found`. Note that `brew install … | tail`
      hides the failure behind `tail`'s exit code, which is how this was
      missed the first time.

- [x] **Reinstall the Command Line Tools.** The `vector` error means the C++
      standard headers were absent from CLT 26.2 on macOS 26.6.2; C compiled,
      C++ did not. Homebrew's "a newer Command Line Tools release is
      available" was the only hint. Needs an administrator:
      `sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install`,
      which opens a dialog and downloads nothing until Install is clicked
      (`sudo softwareupdate --install "Command Line Tools for Xcode 26.6-26.6"`
      does it from the shell). The one-line test afterwards:
      `echo '#include <vector>' | clang++ -x c++ - -fsyntax-only`. Doing this
      while something is compiling kills the build, which is what happened to
      the first Whisper attempt.

- [x] **Install FFmpeg as a static binary instead of waiting for a source
      build.** From the Intel static builds at
      [evermeet.cx](https://evermeet.cx/ffmpeg/), which ffmpeg.org links to.
      `ffmpeg` and `ffprobe` are separate downloads there, and VoiceMode
      requires both: its startup check is `ffmpeg and ffprobe`, and with only
      the first present it says "FFmpeg is not installed", which cost a round
      trip to another chat. Both live in `~/.local/bin` with symlinks in
      `/usr/local/bin` so any PATH finds them. The check runs once when the
      MCP server starts and is cached, so a server started before the fix
      keeps the old answer until `/mcp` reconnects it.

## Phase 3: Install VoiceMode at user scope

- [x] **Install the plugin.** `claude plugin marketplace add mbailey/voicemode`
      then `claude plugin install voicemode@voicemode`, scope user, version
      8.12.0. It registers the `voicemode` MCP server, the
      `/voicemode:converse`, `install` and `status` commands, skills, and six
      hooks.

- [x] **Make the plugin's MCP server start.** It runs `uv run voicemode` in
      its own directory, which declares `requires-python = ">=3.10"`, so `uv`
      chose the newest interpreter, 3.14. `pydantic-core` ships no 3.14 wheel,
      `uv` tried to compile it with Rust, failed, and the server showed
      "Failed to connect". A `.python-version` containing `3.13` in
      `~/.claude/plugins/cache/voicemode/voicemode/<version>/` fixes it. That
      directory is rewritten on plugin update, so the first "Failed to
      connect" after one is this, not something new. On 3.13 everything has a
      wheel except `simpleaudio`, which is plain C and builds.

- [x] **Install the CLI the same way.**
      `uv tool install --python 3.13 voice-mode` gives `voicemode` on the
      PATH for `config`, `service`, `status`, `converse` and `deps`. The
      `/voicemode:install` command's own `uvx voice-mode-install --yes`
      aborted at the Homebrew FFmpeg step and never got this far.

- [x] **Silence the hooks.** Each of the six hooks plays a sound on every tool
      call, permission prompt and stop, through whatever the output device
      is, which meant beeping in the headphones for the rest of the install.
      `voicemode soundfonts off` lasts one session; the permanent setting is
      `VOICEMODE_SOUNDFONTS_ENABLED=false` in `~/.voicemode/voicemode.env`.
      The hooks stay, because they are what lets the server speak.

- [x] **Set the voices.**
      `VOICEMODE_VOICES=bm_george,bm_lewis,bm_daniel,bm_fable`, so
      `bm_george` is the default and the other three audition by reordering
      the list or by `voice="bm_lewis"` on a single `converse` call. Samples
      of all four were generated for comparison.

## Phase 4: Local speech services

- [x] **Discover that Kokoro cannot run natively on an Intel Mac.**
      `voicemode service install kokoro` reported success, then its
      LaunchAgent looped forever failing `uv pip install`. Kokoro-FastAPI pins
      `torch==2.6.0`; PyTorch's last release with an Intel macOS wheel is
      2.2.2, and the `pytorch-cpu` index has only arm64 builds of 2.6.0.
      Nothing reconciles those. The service was stopped and disabled.

- [x] **Run Kokoro in Docker instead.** The project's Linux amd64 CPU image,
      on the port VoiceMode already looks at, so no configuration changed:
      `docker run -d --name voicemode-kokoro --restart unless-stopped -p 127.0.0.1:8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest`.
      The 3.3 GB pull dropped twice with `unexpected EOF` on its largest
      layer, apparently at Docker Desktop's internal proxy, and succeeded on
      the third attempt; fetched layers survive between tries. Docker Desktop
      must now be running for spoken replies to work.

- [x] **Install Whisper, and rebuild it CPU-only.** `voicemode service install
      whisper` pulls whisper.cpp, its `llama.cpp` dependency (a few hundred
      megabytes of git history), `cmake` and SDL from Homebrew, and the `base`
      model. It then builds with `-DGGML_METAL=ON`, which the installer adds
      whenever the OS is macOS with no check for Apple Silicon. On this
      machine Metal means the AMD GPU, which ggml does not support properly:
      the Kennedy sample transcribed as "And I. I, I", after an 80-second
      Metal shader compile at startup. Rebuilt CPU-only it is word perfect:
      `cd ~/.voicemode/services/whisper && cmake -B build -DWHISPER_SDL2=ON -DGGML_METAL=OFF && cmake --build build -j 8 --config Release`,
      then `voicemode service restart whisper`. On an Intel Mac, Metal is a
      correctness bug to turn off, not an acceleration to leave on.

- [x] **Work around two more installer bugs.** When any build step fails the
      installer calls `.decode()` on a string in its own error handler, and
      that traceback replaces the real error; running the same `cmake`
      commands by hand is how to see what failed. And it reported success
      with `models/ggml-base.bin` at 4.4 MB of 141 MB, the log showing the
      download at 3% directly above "installed successfully", so the server
      loaded a corrupt model. `models/download-ggml-model.sh base` in the
      whisper directory fetches it properly; check the size afterwards.

- [x] **Do not run three big downloads at once.** The Docker image, the
      `llama.cpp` clone and the model each crawled at around 230 KB/s on a
      connection measuring 6 MB/s to Cloudflare and 5 MB/s to GitHub on its
      own. Serialising them would have been quicker than the two hours it
      took, and it is worth knowing before concluding the network is broken.

## Phase 5: First conversation, and what it measured

- [x] **Prove the loop from the command line.**
      `voicemode converse --voice bm_george "…"` speaks through Kokoro then
      listens and transcribes through Whisper, without Claude in the loop, so
      it isolates the audio path. The first run heard nothing.

- [x] **Fix the headset microphone.** The Bose QC Ultra 2, in the 16 kHz
      hands-free mode Bluetooth drops into when the mic opens, peaked at
      0.044 on a scale of one on a spoken sentence; the MacBook's built-in mic
      peaked at 1.0 on the same words. VoiceMode's voice-activity detector
      defaults to its most aggressive level, 3, and heard nothing from the
      headset. Three settings in `voicemode.env` fixed it:
      `VOICEMODE_VAD_AGGRESSIVENESS=0`, `VOICEMODE_SILENCE_THRESHOLD_MS=1500`
      (the one-second default cut a reply off after "Hello?") and
      `VOICEMODE_MIN_RECORDING_DURATION=2`. Separately, macOS keeps input and
      output devices independent: the first test spoke through the laptop
      speakers while listening on the headset. Set both to the headset.

- [x] **Prove it through the MCP server from a Claude Code session.** After
      the `ffprobe` fix and an `/mcp` reconnect, `/voicemode:converse` in a
      fresh session held a real exchange. Servers started before the fix
      need the reconnect; the plugin is not loaded into sessions that predate
      its install.

- [x] **Measure the latency the plan feared.** Whisper `base` on the CPU:
      1.7 to 2.0 seconds for an 11-second clip at steady state, 1.2 seconds
      for a short reply in a real exchange, around 8.5 seconds for the first
      request while it warms. Kokoro in Docker: 2.4 to 4.7 seconds to the
      first audio, then it streams; about 4 seconds for a short sentence.
      End to end about 10 seconds for one exchange, of which Whisper is the
      smallest part. The plan had these the wrong way round: local Whisper on
      Intel is fine, and Kokoro is the slow half.

- [x] **Run the services by hand, not at login.** Two engines idling in the
      background is a cost on a laptop that is only occasionally used for
      voice, so Whisper's LaunchAgent was removed with
      `voicemode service disable whisper`, and Kokoro's container was created
      with `--restart unless-stopped`, which treats a manual stop as final.
      Neither starts at login or after a reboot. To begin a voice session:

      ```bash
      voicemode service start whisper     # runs whisper-server directly, no agent needed
      docker start voicemode-kokoro       # Docker Desktop must be running
      voicemode status                    # both should show healthy
      ```

      To end one:

      ```bash
      voicemode service stop whisper
      docker stop voicemode-kokoro
      ```

      Kokoro takes a minute or so after `docker start` before it answers on
      port 8880; Whisper is ready in a few seconds now that Metal is off.
      `voicemode service enable whisper` puts the login start back if it is
      ever wanted, and `docker update --restart always voicemode-kokoro` does
      the same for Kokoro.

## Phase 6: Spoken-reply rules

- [ ] **Create a user-level output style**, at `~/.claude/output-styles/`,
      which does not yet exist on this machine, so it covers both
      repositories. An output style replaces the response register wholesale
      rather than layering instructions, which is what spoken replies need.
      The rules from the brief: one to three sentences unless more is asked
      for; high-level overviews and decisions; never read out code, file
      paths, stack traces or diffs, but say what they mean; no markdown,
      bullets, code blocks or symbols; at most two options with one
      recommended; British English, direct and concise; while driving, stay
      in planning and discussion, making no file edits and running nothing
      that needs approval, queueing them instead.

- [ ] **Add the TL;DR carve-out to `CLAUDE.md`.** That file requires every
      response to end in a `## TL;DR` of markdown bullets and says the rule
      outranks any output style. Spoken replies must contain no markdown, so
      the two contradict each other in plain sight. The exception has to be
      written where the rule is, or the next reader concludes the voice style
      is broken.

- [ ] **Say in the style that it is not a sandbox.** An output style is
      guidance to the model; it cannot prevent a tool call the way
      permissions or plan mode can. If edits must genuinely not happen while
      driving, plan mode enforces it and the prose does not.

## Phase 7: In-car test, stationary

- [ ] **Confirm audio goes to the headphones, both directions.** Output and
      input are separate settings on macOS and the first indoor test had
      them on different devices. Check neither the car stereo nor the laptop
      speakers is in the path.

- [ ] **Confirm the mic does not hear the spoken reply.** The headset's echo
      cancellation normally handles this; if it does not, stop the reply
      playing through anything the mic can hear.

- [ ] **Test silence detection against engine and road noise.** Currently
      tuned for a quiet room on a Bluetooth headset. Check a pause still ends
      the turn and road noise is not taken for speech. The levers are
      `VOICEMODE_VAD_AGGRESSIVENESS` towards 3 if noise triggers it and a
      longer `VOICEMODE_SILENCE_THRESHOLD_MS` if turns end early; `converse`
      also takes `vad_aggressiveness` per call, so this can be tried without
      editing the file.

- [ ] **Measure the round trip and decide whether ten seconds is acceptable
      at the wheel.** The indoor figure is about 10 seconds, most of it
      Kokoro. If that is unpleasant, the options are the `/voice` split for
      the listening half or a remote Kokoro on a machine with a GPU for the
      speaking half.

- [ ] **Decide whether the laptop is in the car at all.** Everything built
      here assumes it is, with the headset paired to it. If it is to stay at
      home, this becomes Happy Coder or Remote Control, and a different plan.

## Phase 8: Documentation

- [ ] **Write `docs/voice-mode.md`** for other developers: what VoiceMode is;
      prerequisites; both install routes with the corrected fallback command;
      voice selection; the spoken-reply rules and how to enable them; the
      safety note that headphones are required and voice sessions stay in
      planning while driving; the privacy note that the microphone is live for
      as long as the session is and voice sessions are not for discussing
      patients; and a troubleshooting section built from Phases 2 to 5. British
      English, no em dashes, plain prose. It is last on purpose: most of its
      value is the troubleshooting, and that could only be written from a real
      install.

- [ ] **Decide the Whisper model.** The installer chose `base`; `small` is
      the next step in accuracy and `large-v3-turbo` the one the docs
      recommend, and both cost startup time and latency on this CPU. Wait
      until real use shows how often `base` mishears.

## Decisions

- **The full local loop, not the `/voice` split** — before measuring, taking
  dictation from Claude Code's `/voice` and keeping VoiceMode only for speaking
  looked like the shape to build, removing the Intel problem and any third
  party. It was not built because Whisper turned out to be the fast half, and
  the local loop keeps every byte of audio on the machine, which in a clinical
  codebase is worth more than the second or two `/voice` would save. The
  split stays in reserve; `converse` supports `say`-only turns, so it is a
  configuration change, not a rebuild.

- **Metal off on Intel** — ggml's Metal backend on an AMD GPU is not slow, it
  is wrong, and the installer cannot be told otherwise, so the CPU build is
  done by hand and will need redoing after any `voicemode service install
  whisper`.

- **Kokoro in Docker** — the only way it runs on this machine at all. It ties
  spoken replies to Docker Desktop being up, which this project's developers
  already keep running.

- **Static FFmpeg over a source build** — Homebrew's Intel source build of
  FFmpeg is a long chain of packages on unsupported hardware; a static binary
  from the site ffmpeg.org links to was minutes rather than hours, at the
  cost of not being updated by `brew upgrade`.

- **Voice-activity detector at its least aggressive** — tuned for a quiet
  room on a Bluetooth headset, which is the real device. It is the setting
  most likely to move after the in-car test.

- **Voice sessions are not for discussing patients** — everything the
  microphone hears is transcribed and read by Claude, and a passenger
  thinking aloud is in scope. Keeping the audio local removes the third
  party; it does not remove the transcript. The documentation says so
  plainly.
