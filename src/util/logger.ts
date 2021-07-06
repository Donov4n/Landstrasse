export type LogFunction = (
    logLevel: LogLevel,
    timestamp: Date,
    logText: string,
) => void;

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

class Logger {
    public logFunction?: LogFunction;

    private debug: boolean;

    constructor(logFunction?: LogFunction, debug: boolean = false) {
        this.debug = debug;
        this.logFunction = logFunction;
    }

    public log(logLevel: LogLevel, logContent: any) {
        if (!this.debug && logLevel === LogLevel.DEBUG) {
            return;
        }

        if (this.logFunction) {
            this.logFunction(logLevel, new Date(), logContent);
        } else {
            console.log(`[${logLevel}] ${logContent}`);
        }
    }
}

export default Logger;
