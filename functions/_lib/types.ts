export interface Env {
  DB: D1Database;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_REDIRECT_URI: string;
  SESSION_SECRET: string;
  ADMIN_TWITCH_USER_ID: string;
  ENVIRONMENT?: string;
}

export interface SessionUser {
  sessionHash: string;
  csrfToken: string;
  twitchUserId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  twitchCreatedAt: string;
  firstSeenAt: string;
  isAdmin: boolean;
}

export type ApiContext = EventContext<Env, string, Record<string, unknown>>;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_failed') {
    super(message);
  }
}
