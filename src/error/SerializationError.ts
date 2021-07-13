class SerializationError extends Error {
    constructor(public inner: Error) {
        super('Serialization failed.');
    }
}

export default SerializationError;
