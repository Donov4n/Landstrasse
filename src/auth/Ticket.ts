import AbstractAuthProvider from './AbstractAuthProvider';

import type { Signature } from '../types/AuthProvider';
import type { WampDict } from '../types/messages/MessageTypes';

/**
 * TicketFunction describes a callback which is used to compute the
 * `challenge` (== password) for ticket based authentication.
 * We don't want to keep the password in persistent storage,
 * so we can't just store it at the instance level.
 * Instead, we defer the actual password generation to the
 * user of our code and just pass it around as return value.
 *
 * @param authExtra Additional details which are sent by the server
 *                  which can be used by the client to compute its response.
 *
 * @return A promise with the correct signature and, possibly details.
 */
export type TicketFunction = (authExtra: WampDict) => Promise<Signature>;

/**
 * Ticket authentication provider.
 *
 * This can be used to login with username and password or any other sort of static token.
 */
class TicketAuthProvider extends AbstractAuthProvider {
    private readonly _ticketFunction: TicketFunction;

    public get isTransportLevel(): boolean {
        return false;
    }

    /**
     * Creates a new instance of the ticket provider.
     *
     * @param authId - The username to send to the server.
     * @param ticketFunction - A callback used to retrieve the token/password.
     * @param authMethod - Name of the authmethod (default: 'ticket').
     */
    constructor(authId: string, ticketFunction: TicketFunction, authMethod: string = 'ticket') {
        super(authId, authMethod);

        this._ticketFunction = ticketFunction;
    }

    /** @inheritDoc */
    public computeChallenge(authExtra: WampDict): Promise<Signature> {
        return this._ticketFunction(authExtra);
    }
}

export default TicketAuthProvider;
