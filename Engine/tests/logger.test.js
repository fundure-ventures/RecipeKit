import { expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import { Log } from '../src/logger.js';

describe("Logger", () => {

  beforeEach(() => {
    Log.setDebug(false);
  });

  test("setDebug toggles debug mode", () => {
    expect(Log.isDebug).toBe(false);
    Log.setDebug(true);
    expect(Log.isDebug).toBe(true);
    Log.setDebug(false);
    expect(Log.isDebug).toBe(false);
  });

  test("debug() logs only when isDebug=true", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    
    Log.setDebug(false);
    Log.debug("should not appear");
    expect(spy).not.toHaveBeenCalled();

    Log.setDebug(true);
    Log.debug("should appear");
    expect(spy).toHaveBeenCalledWith("should appear");

    spy.mockRestore();
    Log.setDebug(false);
  });

  test("warn() always logs", () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    
    Log.setDebug(false);
    Log.warn("warning message");
    expect(spy).toHaveBeenCalledWith("warning message");

    spy.mockRestore();
  });

  test("error() always logs", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    
    Log.setDebug(false);
    Log.error("error message");
    expect(spy).toHaveBeenCalledWith("error message");

    spy.mockRestore();
  });

  test("debug() passes multiple args", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    Log.setDebug(true);
    Log.debug("arg1", "arg2", 3);
    expect(spy).toHaveBeenCalledWith("arg1", "arg2", 3);
    spy.mockRestore();
    Log.setDebug(false);
  });

  test("singleton returns same instance", () => {
    const Log2 = new Log.constructor();
    expect(Log2).toBe(Log);
  });
});
