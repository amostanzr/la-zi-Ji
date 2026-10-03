#!/bin/bash
# Double-click to start Bible Journal on a Mac.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
node --disable-warning=ExperimentalWarning server.js
read -r -p "Bible Journal has stopped. Press Enter to close."
