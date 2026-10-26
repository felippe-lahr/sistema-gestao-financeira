export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// Sessão: padrão = 30 min de inatividade; "Manter conectado neste aparelho" =
// 30 dias, renovados a cada uso (server/_core/context.ts).
export const SESSION_DEFAULT_MS = 30 * 60 * 1000;
export const SESSION_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
