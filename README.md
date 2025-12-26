# Earth Class Mail MCP

Access your [Earth Class Mail](https://earthclassmail.com) virtual mailbox from Claude.

## Quick Install

**Claude Desktop:** Download [`earthclassmail.dxt`](https://github.com/usiegj00/earthclassmail-mcp/releases/latest/download/earthclassmail.dxt) and double-click to install.

**Claude Code:**
```bash
claude mcp add earthclassmail -- npx -y @usiegj00/earthclassmail-mcp
```

You'll need your API key from Earth Class Mail: **Settings → Integrations → Generate Key**

---

## What You Can Do

- **List inboxes** and see unread mail counts
- **View mail pieces** with envelope images and sender info
- **Get scanned content** (PDFs) for opened mail
- **Request actions**: scan, shred, ship, archive, trash
- **Manage recipients** on your mailbox

## Tools

| Tool | Description |
|------|-------------|
| `ecm_get_user` | Get your account info |
| `ecm_list_inboxes` | List all your mailboxes |
| `ecm_list_pieces` | List mail in an inbox |
| `ecm_get_piece` | Get details + scanned content for a piece |
| `ecm_list_recipients` | List names on a mailbox |
| `ecm_perform_action` | Scan, shred, ship, archive, etc. |

## Manual Installation

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "earthclassmail": {
      "command": "npx",
      "args": ["-y", "@usiegj00/earthclassmail-mcp"],
      "env": {
        "EARTHCLASSMAIL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Code

```bash
# Add with environment variable
claude mcp add earthclassmail -e EARTHCLASSMAIL_API_KEY=your-key -- npx -y @usiegj00/earthclassmail-mcp
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "earthclassmail": {
      "command": "npx",
      "args": ["-y", "@usiegj00/earthclassmail-mcp"],
      "env": {
        "EARTHCLASSMAIL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Getting Your API Key

1. Log in to [Earth Class Mail](https://app.earthclassmail.com)
2. Go to **Settings** (gear icon)
3. Click **Integrations** tab
4. Under "Custom API integration", click **Generate Key**
5. Copy the key (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## Example Usage

> "Show me my unread mail"

> "What mail did I receive this week from the IRS?"

> "Request a scan of piece 12345678"

> "Shred all the junk mail in my inbox"

## License

MIT
