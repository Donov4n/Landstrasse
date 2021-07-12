export type { WampID, WampURI, WampDict, WampList, EMatchPolicy } from './types/messages/MessageTypes';
export type { WelcomeDetails } from './types/messages/WelcomeMessage';

export type { default as Registration } from './processor/callee/generic/registration';
export type { default as Subscription } from './processor/subscriber/generic/subscription';
export type { default as Publication } from './processor/publisher/generic/publication';

// - Export public interfaces to interact with the library
export * from './types/Serializer';
export * from './types/Transport';
export * from './types/AuthProvider';
export * from './types/Connection';

// - Export errors
export { default as WampError } from './error/WampError';
export { default as ConnectionOpenError } from './error/ConnectionOpenError';

// - Export the different authentication providers
export { default as AbstractAuthProvider } from './auth/AbstractAuthProvider';
export { default as TLSAuthProvider } from './auth/TLS';
export { default as TicketAuthProvider } from './auth/Ticket';
export { default as CookieAuthProvider } from './auth/Cookie';
export { default as AnonymousAuthProvider } from './auth/Anonymous';

export { default } from './connection';
