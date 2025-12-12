export interface CalendarAccount {
	email: string;
	oauth2: {
		clientId: string;
		clientSecret: string;
		refreshToken: string;
		accessToken?: string;
	};
}
