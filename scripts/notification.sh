#!/bin/bash

# Play notification sound
# Usage: ./scripts/notification.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIO_FILE="$SCRIPT_DIR/level-completed.mp3"

if [ -f "$AUDIO_FILE" ]; then
    afplay "$AUDIO_FILE"
else
    echo "Audio file not found: $AUDIO_FILE" >&2
    exit 1
fi
