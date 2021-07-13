export type LogFunction = (
    level: LogLevel,
    timestamp: Date,
    message: string,
    details: any[]
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

    public log(level: LogLevel, message: string, ...details: any) {
        if (!this.debug && level === LogLevel.DEBUG) {
            return;
        }

        if (this.logFunction) {
            this.logFunction(level, new Date(), message, details);
        } else {
            const methodMap: Record<LogLevel, keyof Console> = {
                [LogLevel.DEBUG]: 'debug',
                [LogLevel.WARNING]: 'warn',
                [LogLevel.ERROR]: 'error',
                [LogLevel.INFO]: 'log',
            };
            const method = level in methodMap ? methodMap[level] : 'log';
            console[method](`[WebSocket] ${message}`, ...details);
        }
    }
}

export default Logger;
