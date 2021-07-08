export type { WampID, WampURI, WampDict, WampList, EMatchPolicy } from './types/messages/MessageTypes';
export type { WelcomeDetails } from './types/messages/WelcomeMessage';

// - Export public interfaces to interact with the library
export * from './types/Serializer';
export * from './types/Transport';
export * from './types/AuthProvider';
export * from './types/Connection';

// - Export errors
export { default as WampError } from './error/WampError';
export { default as ConnectionOpenError } from './error/ConnectionOpenError';
export { default as ConnectionCloseError } from './error/ConnectionCloseError';

// - Export the different authentication providers
export { default as AbstractAuthProvider } from './auth/AbstractAuthProvider';
export { default as TLSAuthProvider } from './auth/TLS';
export { default as TicketAuthProvider } from './auth/Ticket';
export { default as CookieAuthProvider } from './auth/Cookie';
export { default as AnonymousAuthProvider } from './auth/Anonymous';

export { default } from './connection';
