import pkg from "../package.json" with { type: "json" };

/** The server's version, set by hand in package.json. See CLAUDE.md, Version. */
export const VERSION = pkg.version;
