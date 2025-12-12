#!/usr/bin/env node

import * as fs from "fs";
import { parseArgs } from "util";
import { CalendarService } from "./calendar-service.js";

const service = new CalendarService();

function usage(): never {
	console.log(`gccli - Google Calendar CLI

USAGE

  gccli accounts <action>                    Account management
  gccli <email> <command> [options]          Calendar operations

ACCOUNT COMMANDS

  gccli accounts credentials <file.json>     Set OAuth credentials (once)
  gccli accounts list                        List configured accounts
  gccli accounts add <email> [--manual]      Add account (--manual for browserless OAuth)
  gccli accounts remove <email>              Remove account

CALENDAR COMMANDS

  gccli <email> calendars
      List all calendars. Returns: ID, name, access role.

  gccli <email> events <calendarId> [options]
      List events from a calendar.
      Options:
        --from <datetime>    Start time (ISO 8601, default: now)
        --to <datetime>      End time (ISO 8601, default: 1 week from now)
        --max <n>            Max results (default: 10)
        --page <token>       Page token for pagination
        --query <q>          Free text search

  gccli <email> event <calendarId> <eventId>
      Get event details.

  gccli <email> create <calendarId> --summary <s> --start <dt> --end <dt> [options]
      Create a new event.
      Options:
        --summary <s>        Event title (required)
        --start <datetime>   Start time (required, ISO 8601)
        --end <datetime>     End time (required, ISO 8601)
        --description <d>    Event description
        --location <l>       Event location
        --attendees <emails> Attendees (comma-separated)
        --all-day            Create all-day event (use YYYY-MM-DD for start/end)

  gccli <email> update <calendarId> <eventId> [options]
      Update an existing event.
      Options: same as create (all optional)

  gccli <email> delete <calendarId> <eventId>
      Delete an event.

  gccli <email> freebusy <calendarIds> --from <dt> --to <dt>
      Check free/busy status for calendars (comma-separated IDs).

EXAMPLES

  gccli accounts list
  gccli you@gmail.com calendars
  gccli you@gmail.com events primary
  gccli you@gmail.com events primary --from 2024-01-01T00:00:00Z --max 50
  gccli you@gmail.com event primary abc123
  gccli you@gmail.com create primary --summary "Meeting" --start 2024-01-15T10:00:00 --end 2024-01-15T11:00:00
  gccli you@gmail.com create primary --summary "Vacation" --start 2024-01-20 --end 2024-01-25 --all-day
  gccli you@gmail.com update primary abc123 --summary "Updated Meeting"
  gccli you@gmail.com delete primary abc123
  gccli you@gmail.com freebusy primary,work@group.calendar.google.com --from 2024-01-15T00:00:00Z --to 2024-01-16T00:00:00Z

DATA STORAGE

  ~/.gccli/credentials.json   OAuth client credentials
  ~/.gccli/accounts.json      Account tokens`);
	process.exit(1);
}

function error(msg: string): never {
	console.error("Error:", msg);
	process.exit(1);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		usage();
	}

	const first = args[0];
	const rest = args.slice(1);

	try {
		if (first === "accounts") {
			await handleAccounts(rest);
			return;
		}

		const account = first;
		const command = rest[0];
		const commandArgs = rest.slice(1);

		if (!command) {
			error("Missing command. Use --help for usage.");
		}

		switch (command) {
			case "calendars":
				await handleCalendars(account);
				break;
			case "events":
				await handleEvents(account, commandArgs);
				break;
			case "event":
				await handleEvent(account, commandArgs);
				break;
			case "create":
				await handleCreate(account, commandArgs);
				break;
			case "update":
				await handleUpdate(account, commandArgs);
				break;
			case "delete":
				await handleDelete(account, commandArgs);
				break;
			case "freebusy":
				await handleFreeBusy(account, commandArgs);
				break;
			default:
				error(`Unknown command: ${command}`);
		}
	} catch (e) {
		error(e instanceof Error ? e.message : String(e));
	}
}

async function handleAccounts(args: string[]) {
	const action = args[0];
	if (!action) error("Missing action: list|add|remove|credentials");

	switch (action) {
		case "list": {
			const accounts = service.listAccounts();
			if (accounts.length === 0) {
				console.log("No accounts configured");
			} else {
				for (const a of accounts) {
					console.log(a.email);
				}
			}
			break;
		}
		case "credentials": {
			const credFile = args[1];
			if (!credFile) error("Usage: accounts credentials <credentials.json>");
			const creds = JSON.parse(fs.readFileSync(credFile, "utf8"));
			// Handle Google's download format or gmcli's stored format
			const installed = creds.installed || creds.web;
			const clientId = installed?.client_id || creds.clientId;
			const clientSecret = installed?.client_secret || creds.clientSecret;
			if (!clientId || !clientSecret) error("Invalid credentials file");
			service.setCredentials(clientId, clientSecret);
			console.log("Credentials saved");
			break;
		}
		case "add": {
			const manual = args.includes("--manual");
			const filtered = args.slice(1).filter((a) => a !== "--manual");
			const email = filtered[0];
			if (!email) error("Usage: accounts add <email> [--manual]");
			const creds = service.getCredentials();
			if (!creds) error("No credentials configured. Run: gccli accounts credentials <credentials.json>");
			await service.addAccount(email, creds.clientId, creds.clientSecret, manual);
			console.log(`Account '${email}' added`);
			break;
		}
		case "remove": {
			const email = args[1];
			if (!email) error("Usage: accounts remove <email>");
			const deleted = service.deleteAccount(email);
			console.log(deleted ? `Removed '${email}'` : `Not found: ${email}`);
			break;
		}
		default:
			error(`Unknown action: ${action}`);
	}
}

async function handleCalendars(account: string) {
	const calendars = await service.listCalendars(account);
	if (calendars.length === 0) {
		console.log("No calendars");
	} else {
		console.log("ID\tNAME\tROLE");
		for (const c of calendars) {
			console.log(`${c.id}\t${c.summary || ""}\t${c.accessRole || ""}`);
		}
	}
}

async function handleEvents(account: string, args: string[]) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			from: { type: "string" },
			to: { type: "string" },
			max: { type: "string" },
			page: { type: "string" },
			query: { type: "string" },
		},
		allowPositionals: true,
	});

	const calendarId = positionals[0];
	if (!calendarId) error("Usage: <email> events <calendarId> [options]");

	const now = new Date();
	const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	const result = await service.listEvents(account, calendarId, {
		timeMin: values.from || now.toISOString(),
		timeMax: values.to || oneWeekLater.toISOString(),
		maxResults: values.max ? Number(values.max) : 10,
		pageToken: values.page,
		query: values.query,
	});

	if (result.events.length === 0) {
		console.log("No events");
	} else {
		console.log("ID\tSTART\tEND\tSUMMARY");
		for (const e of result.events) {
			const start = e.start?.dateTime || e.start?.date || "";
			const end = e.end?.dateTime || e.end?.date || "";
			console.log(`${e.id}\t${start}\t${end}\t${e.summary || "(no title)"}`);
		}
		if (result.nextPageToken) {
			console.log(`\n# Next page: --page ${result.nextPageToken}`);
		}
	}
}

async function handleEvent(account: string, args: string[]) {
	const calendarId = args[0];
	const eventId = args[1];
	if (!calendarId || !eventId) error("Usage: <email> event <calendarId> <eventId>");

	const event = await service.getEvent(account, calendarId, eventId);

	console.log(`ID: ${event.id}`);
	console.log(`Summary: ${event.summary || "(no title)"}`);
	console.log(`Start: ${event.start?.dateTime || event.start?.date || ""}`);
	console.log(`End: ${event.end?.dateTime || event.end?.date || ""}`);
	if (event.location) console.log(`Location: ${event.location}`);
	if (event.description) console.log(`Description: ${event.description}`);
	if (event.attendees && event.attendees.length > 0) {
		console.log(`Attendees: ${event.attendees.map((a) => a.email).join(", ")}`);
	}
	console.log(`Status: ${event.status}`);
	console.log(`Link: ${event.htmlLink}`);
}

async function handleCreate(account: string, args: string[]) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			summary: { type: "string" },
			description: { type: "string" },
			location: { type: "string" },
			start: { type: "string" },
			end: { type: "string" },
			attendees: { type: "string" },
			"all-day": { type: "boolean" },
		},
		allowPositionals: true,
	});

	const calendarId = positionals[0];
	if (!calendarId) error("Usage: <email> create <calendarId> --summary <s> --start <dt> --end <dt>");
	if (!values.summary || !values.start || !values.end) {
		error("Required: --summary, --start, --end");
	}

	const event = await service.createEvent(account, calendarId, {
		summary: values.summary,
		description: values.description,
		location: values.location,
		start: values.start,
		end: values.end,
		attendees: values.attendees?.split(","),
		allDay: values["all-day"],
	});

	console.log(`Created: ${event.id}`);
	console.log(`Link: ${event.htmlLink}`);
}

async function handleUpdate(account: string, args: string[]) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			summary: { type: "string" },
			description: { type: "string" },
			location: { type: "string" },
			start: { type: "string" },
			end: { type: "string" },
			attendees: { type: "string" },
			"all-day": { type: "boolean" },
		},
		allowPositionals: true,
	});

	const calendarId = positionals[0];
	const eventId = positionals[1];
	if (!calendarId || !eventId) error("Usage: <email> update <calendarId> <eventId> [options]");

	const event = await service.updateEvent(account, calendarId, eventId, {
		summary: values.summary,
		description: values.description,
		location: values.location,
		start: values.start,
		end: values.end,
		attendees: values.attendees?.split(","),
		allDay: values["all-day"],
	});

	console.log(`Updated: ${event.id}`);
}

async function handleDelete(account: string, args: string[]) {
	const calendarId = args[0];
	const eventId = args[1];
	if (!calendarId || !eventId) error("Usage: <email> delete <calendarId> <eventId>");

	await service.deleteEvent(account, calendarId, eventId);
	console.log("Deleted");
}

async function handleFreeBusy(account: string, args: string[]) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			from: { type: "string" },
			to: { type: "string" },
		},
		allowPositionals: true,
	});

	const calendarIds = positionals[0];
	if (!calendarIds || !values.from || !values.to) {
		error("Usage: <email> freebusy <calendarIds> --from <dt> --to <dt>");
	}

	const result = await service.getFreeBusy(account, calendarIds.split(","), values.from, values.to);

	for (const [calId, busy] of result) {
		console.log(`${calId}:`);
		if (busy.length === 0) {
			console.log("  (free)");
		} else {
			for (const b of busy) {
				console.log(`  ${b.start} - ${b.end}`);
			}
		}
	}
}

main();
