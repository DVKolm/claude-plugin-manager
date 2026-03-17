---
name: open
description: "Open the Plugin Manager UI in the browser. Use when the user wants to manage, view, toggle, or configure Claude Code plugins through a visual interface."
allowed-tools: [Bash, Read]
---

# Open Plugin Manager

Launch the Plugin Manager web UI in the user's browser.

## Steps

1. **Check if server is already running:**

Read the file `~/.claude/plugins/plugin-manager.json`. If it exists, check if the PID in it is still alive:
- **Linux/macOS:** `kill -0 <pid> 2>/dev/null && echo "alive" || echo "dead"`
- **Windows:** `tasklist /FI "PID eq <pid>" 2>NUL | findstr <pid> >NUL && echo alive || echo dead`

2. **If alive:** Tell the user the Plugin Manager is already running and provide the URL: `http://localhost:<port>` (they'll need to open it in their browser — the token was already exchanged).

3. **If dead or file doesn't exist:** Start the server:
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/server.js" &
```

Read the first line of output — it's a JSON object with `url` and `port`.

4. **Tell the user** to open the URL in their browser. The URL includes a one-time auth token.

## Notes
- The server auto-exits after 30 minutes of inactivity
- The server binds to localhost only (127.0.0.1)
- Changes made in the UI take effect on the next Claude Code session
