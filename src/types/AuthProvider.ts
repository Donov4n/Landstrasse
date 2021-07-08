import type { WampDict } from './messages/MessageTypes';

/**
 * Signature is the type an authentication provider provides its results in.
 */
export type Signature = {
    /**
     * This property contains the token sent to the server, e.g. a hashed password.
     */
    signature: string,

    /**
     * Optionally, a user might specify additional details which the
     * server might use to permit or reject the authentication.
     */
    details?: WampDict,
};

/**
 * Basic interface which all authentication providers need to support.
 *
 * Basically, there are two forms of authentication:
 * - Transport Level (i.e. based on the connection, for example based on IP ranges, TLS certificates or cookies)
 * - Session Level (based on tokens, such as passwords or resume tokens).
 *
 * These are distinguished by the [[IsTransportLevel]] method.
 * For transport level authentication methods, ComputeChallenge won't be called.
 */
export interface AuthProviderInterface {
    /**
     * Gets a value indicating whether the authentication is performed on the session or transport level.
     * @returns true if authentication is performed on the transport level, false for session level.
     */
    get isTransportLevel(): boolean;

    /**
     * Gets the string representing the authentication method for the server to verify the authentication.
     */
    get authMethod(): string;

    /**
     * Gets the username to authenticate as.
     * The username passed here is sent to the server, but the server might
     * decide to change the username during the authentication.
     */
    get authId(): string;

    /**
     * A asynchronous function which computes the session level
     * authentication response which is sent to the server as response.
     *
     * Will only be called if `isTransportLevel` returned `false`.
     *
     * @param authExtra - Additional details provided by the server.
     *
     * @return The response which should be sent to the server.
     */
    computeChallenge(authExtra: WampDict): Promise<Signature>;
}
