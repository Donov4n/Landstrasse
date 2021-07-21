class Deferred<T = any> {
    public readonly promise: Promise<T>;

    private _resolveInternal?: (value: T) => void;
    private _rejectInternal?: (reason?: any) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolveInternal = resolve;
            this._rejectInternal = reject;
        });
    }

    public resolve(value: T) {
        if (arguments.length === 0) {
            // @ts-ignore
            this._resolveInternal!();
        } else {
            this._resolveInternal!(value);
        }
    }

    public reject(error?: any) {
        this._rejectInternal!(error);
    }
}

export default Deferred;
