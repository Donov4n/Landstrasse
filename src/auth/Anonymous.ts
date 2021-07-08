import AbstractAuthProvider from './AbstractAuthProvider';

/**
 * Anonymous authentication provider.
 *
 * AnonymousAuthProvider is a class used to represent a login without a password.
 * It uses the authmethod `anonymous` and a configurable authid (username).
 */
class AnonymousAuthProvider extends AbstractAuthProvider {
    public get isTransportLevel(): boolean {
        return true;
    }

    /**
     * Creates a new instance of the AnonymousAuthProvider.
     *
     * @param authId - The username to authenticate as (default: `anonymous`)
     */
    constructor(authId?: string) {
        super(authId ?? 'anonymous', 'anonymous');
    }
}

export default AnonymousAuthProvider;
