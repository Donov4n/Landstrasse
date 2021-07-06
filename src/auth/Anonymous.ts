import AbstractAuthProvider from './AbstractAuthProvider';

/**
 * AnonymousAuthProvider is a class used to represent a login without a password.
 * It uses the authmethod `anonymous` and a configurable authid (username).
 */
class AnonymousAuthProvider extends AbstractAuthProvider {
    /**
     * Creates a new instance of the AnonymousAuthProvider.
     * @param authid The username to authenticate as (default: `anonymous`)
     */
    constructor(authid?: string) {
        super(authid || 'anonymous', 'anonymous');
    }
}

export default AnonymousAuthProvider;
