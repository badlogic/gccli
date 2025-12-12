# gccli

Minimal Google Calendar CLI for listing calendars, managing events, and checking availability.

## Install

```bash
npm install -g @mariozechner/gccli
```

## Setup

Before adding an account, you need OAuth2 credentials from Google Cloud Console:

1. [Create a new project](https://console.cloud.google.com/projectcreate) (or select existing)
2. [Enable the Google Calendar API](https://console.cloud.google.com/apis/api/calendar-json.googleapis.com)
3. [Set app name](https://console.cloud.google.com/auth/branding) in OAuth branding
4. [Add test users](https://console.cloud.google.com/auth/audience) (all Gmail addresses you want to use with gccli)
5. [Create OAuth client](https://console.cloud.google.com/auth/clients):
   - Click "Create Client"
   - Application type: "Desktop app"
   - Download the JSON file

Then:

```bash
gccli accounts credentials ~/path/to/credentials.json
gccli accounts add you@gmail.com
```

## Usage

```
gccli accounts <action>                Account management
gccli <email> <command> [options]      Calendar operations
```

## Commands

### accounts

```bash
gccli accounts credentials <file.json>   # Set OAuth credentials (once)
gccli accounts list                      # List configured accounts
gccli accounts add <email>               # Add account (opens browser)
gccli accounts add <email> --manual      # Add account (browserless, paste redirect URL)
gccli accounts remove <email>            # Remove account
```

### calendars

List all calendars for an account.

```bash
gccli <email> calendars
```

Returns: ID, name, access role.

### events

List events from a calendar.

```bash
gccli <email> events <calendarId> [options]
```

Options:
- `--from <datetime>` - Start time (ISO 8601, default: now)
- `--to <datetime>` - End time (ISO 8601, default: 1 week from now)
- `--max <n>` - Max results (default: 10)
- `--page <token>` - Page token for pagination
- `--query <q>` - Free text search

Examples:
```bash
gccli you@gmail.com events primary
gccli you@gmail.com events primary --from 2024-01-01T00:00:00Z --max 50
gccli you@gmail.com events primary --query "meeting"
```

### event

Get details for a specific event.

```bash
gccli <email> event <calendarId> <eventId>
```

### create

Create a new event.

```bash
gccli <email> create <calendarId> --summary <s> --start <dt> --end <dt> [options]
```

Options:
- `--summary <s>` - Event title (required)
- `--start <datetime>` - Start time (required, ISO 8601)
- `--end <datetime>` - End time (required, ISO 8601)
- `--description <d>` - Event description
- `--location <l>` - Event location
- `--attendees <emails>` - Attendees (comma-separated)
- `--all-day` - Create all-day event (use YYYY-MM-DD for start/end)

Examples:
```bash
gccli you@gmail.com create primary --summary "Meeting" --start 2024-01-15T10:00:00 --end 2024-01-15T11:00:00
gccli you@gmail.com create primary --summary "Vacation" --start 2024-01-20 --end 2024-01-25 --all-day
gccli you@gmail.com create primary --summary "Team Sync" --start 2024-01-15T14:00:00 --end 2024-01-15T15:00:00 --attendees a@x.com,b@x.com
```

### update

Update an existing event.

```bash
gccli <email> update <calendarId> <eventId> [options]
```

Options: same as create (all optional).

Example:
```bash
gccli you@gmail.com update primary abc123 --summary "Updated Meeting" --location "Room 2"
```

### delete

Delete an event.

```bash
gccli <email> delete <calendarId> <eventId>
```

### freebusy

Check free/busy status for calendars.

```bash
gccli <email> freebusy <calendarIds> --from <dt> --to <dt>
```

Calendar IDs are comma-separated.

Example:
```bash
gccli you@gmail.com freebusy primary,work@group.calendar.google.com --from 2024-01-15T00:00:00Z --to 2024-01-16T00:00:00Z
```

## Data Storage

All data is stored in `~/.gccli/`:
- `credentials.json` - OAuth client credentials
- `accounts.json` - Account tokens

## Development

```bash
npm install
npm run build
npm run check
```

## Publishing

```bash
# Update version in package.json and CHANGELOG.md
npm run build
npm publish --access public
git tag v<version>
git push --tags
```

## License

MIT
