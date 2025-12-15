import { OAuth2Client } from "google-auth-library";
import { type calendar_v3, google } from "googleapis";
import { AccountStorage } from "./account-storage.js";
import { CalendarOAuthFlow } from "./calendar-oauth-flow.js";
import type { CalendarAccount } from "./types.js";

type CalendarEvent = calendar_v3.Schema$Event;
type Calendar = calendar_v3.Schema$CalendarListEntry;

export interface EventSearchResult {
	events: CalendarEvent[];
	nextPageToken?: string;
}

export class CalendarService {
	private accountStorage = new AccountStorage();
	private calendarClients: Map<string, calendar_v3.Calendar> = new Map();

	async addAccount(email: string, clientId: string, clientSecret: string, manual = false): Promise<void> {
		if (this.accountStorage.hasAccount(email)) {
			throw new Error(`Account '${email}' already exists`);
		}

		const oauthFlow = new CalendarOAuthFlow(clientId, clientSecret);
		const refreshToken = await oauthFlow.authorize(manual);

		const account: CalendarAccount = {
			email,
			oauth2: { clientId, clientSecret, refreshToken },
		};

		this.accountStorage.addAccount(account);
	}

	deleteAccount(email: string): boolean {
		this.calendarClients.delete(email);
		return this.accountStorage.deleteAccount(email);
	}

	listAccounts(): CalendarAccount[] {
		return this.accountStorage.getAllAccounts();
	}

	setCredentials(clientId: string, clientSecret: string): void {
		this.accountStorage.setCredentials(clientId, clientSecret);
	}

	getCredentials(): { clientId: string; clientSecret: string } | null {
		return this.accountStorage.getCredentials();
	}

	private getCalendarClient(email: string): calendar_v3.Calendar {
		if (!this.calendarClients.has(email)) {
			const account = this.accountStorage.getAccount(email);
			if (!account) {
				throw new Error(`Account '${email}' not found`);
			}

			const oauth2Client = new OAuth2Client(
				account.oauth2.clientId,
				account.oauth2.clientSecret,
				"http://localhost",
			);

			oauth2Client.setCredentials({
				refresh_token: account.oauth2.refreshToken,
				access_token: account.oauth2.accessToken,
			});

			const calendar = google.calendar({ version: "v3", auth: oauth2Client });
			this.calendarClients.set(email, calendar);
		}

		return this.calendarClients.get(email)!;
	}

	async listCalendars(email: string): Promise<Calendar[]> {
		const calendar = this.getCalendarClient(email);
		const response = await calendar.calendarList.list();
		return response.data.items || [];
	}

	async getCalendarAcl(email: string, calendarId: string): Promise<calendar_v3.Schema$AclRule[]> {
		const calendar = this.getCalendarClient(email);
		const response = await calendar.acl.list({ calendarId });
		return response.data.items || [];
	}

	async listEvents(
		email: string,
		calendarId: string,
		options: {
			timeMin?: string;
			timeMax?: string;
			maxResults?: number;
			pageToken?: string;
			query?: string;
		} = {},
	): Promise<EventSearchResult> {
		const calendar = this.getCalendarClient(email);
		const response = await calendar.events.list({
			calendarId,
			timeMin: options.timeMin,
			timeMax: options.timeMax,
			maxResults: options.maxResults || 10,
			pageToken: options.pageToken,
			q: options.query,
			singleEvents: true,
			orderBy: "startTime",
		});

		return {
			events: response.data.items || [],
			nextPageToken: response.data.nextPageToken || undefined,
		};
	}

	async getEvent(email: string, calendarId: string, eventId: string): Promise<CalendarEvent> {
		const calendar = this.getCalendarClient(email);
		const response = await calendar.events.get({
			calendarId,
			eventId,
		});
		return response.data;
	}

	async createEvent(
		email: string,
		calendarId: string,
		event: {
			summary: string;
			description?: string;
			location?: string;
			start: string;
			end: string;
			attendees?: string[];
			allDay?: boolean;
			meet?: boolean;
		},
	): Promise<CalendarEvent> {
		const calendar = this.getCalendarClient(email);

		const eventBody: calendar_v3.Schema$Event = {
			summary: event.summary,
			description: event.description,
			location: event.location,
			start: event.allDay ? { date: event.start } : { dateTime: event.start },
			end: event.allDay ? { date: event.end } : { dateTime: event.end },
			attendees: event.attendees?.map((e) => ({ email: e })),
		};

		if (event.meet) {
			eventBody.conferenceData = {
				createRequest: {
					requestId: `gccli-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
					conferenceSolutionKey: { type: "hangoutsMeet" },
				},
			};
		}

		const response = await calendar.events.insert({
			calendarId,
			requestBody: eventBody,
			conferenceDataVersion: event.meet ? 1 : undefined,
		});

		return response.data;
	}

	async updateEvent(
		email: string,
		calendarId: string,
		eventId: string,
		updates: {
			summary?: string;
			description?: string;
			location?: string;
			start?: string;
			end?: string;
			attendees?: string[];
			allDay?: boolean;
			meet?: boolean;
		},
	): Promise<CalendarEvent> {
		const calendar = this.getCalendarClient(email);

		// Get existing event first
		const existing = await this.getEvent(email, calendarId, eventId);

		const eventBody: calendar_v3.Schema$Event = {
			...existing,
			summary: updates.summary ?? existing.summary,
			description: updates.description ?? existing.description,
			location: updates.location ?? existing.location,
		};

		if (updates.start !== undefined) {
			eventBody.start = updates.allDay ? { date: updates.start } : { dateTime: updates.start };
		}
		if (updates.end !== undefined) {
			eventBody.end = updates.allDay ? { date: updates.end } : { dateTime: updates.end };
		}
		if (updates.attendees !== undefined) {
			eventBody.attendees = updates.attendees.map((e) => ({ email: e }));
		}
		// Only add Meet if requested
		if (updates.meet) {
			eventBody.conferenceData = {
				createRequest: {
					requestId: `gccli-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
					conferenceSolutionKey: { type: "hangoutsMeet" },
				},
			};
		}

		const response = await calendar.events.update({
			calendarId,
			eventId,
			requestBody: eventBody,
			conferenceDataVersion: 1,
		});

		return response.data;
	}

	async deleteEvent(email: string, calendarId: string, eventId: string): Promise<void> {
		const calendar = this.getCalendarClient(email);
		await calendar.events.delete({
			calendarId,
			eventId,
		});
	}

	async getFreeBusy(
		email: string,
		calendarIds: string[],
		timeMin: string,
		timeMax: string,
	): Promise<Map<string, Array<{ start: string; end: string }>>> {
		const calendar = this.getCalendarClient(email);
		const response = await calendar.freebusy.query({
			requestBody: {
				timeMin,
				timeMax,
				items: calendarIds.map((id) => ({ id })),
			},
		});

		const result = new Map<string, Array<{ start: string; end: string }>>();
		const calendars = response.data.calendars || {};

		for (const [calId, data] of Object.entries(calendars)) {
			const busy = (data.busy || []).map((b) => ({
				start: b.start || "",
				end: b.end || "",
			}));
			result.set(calId, busy);
		}

		return result;
	}
}
