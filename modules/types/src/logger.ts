// Designed to be as simple as possible so client users can easily inject their own
export interface ILogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

// Designed to give devs power over log format & context switching
export interface ILoggerService extends ILogger {
  setContext(context: string): void;
  newContext(context: string): ILoggerService;
}

// Example implementation that can be used as a silent default
export const nullLogger: ILoggerService = {
  debug: (msg: string): void => {},
  info: (msg: string): void => {},
  warn: (msg: string): void => {},
  error: (msg: string): void => {},
  setContext: (context: string): void => {},
  newContext: function(context: string): ILoggerService {
    return this;
  },
};
