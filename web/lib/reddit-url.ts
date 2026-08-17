export function isRedditPostUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "redd.it") {
      return /^\/[a-z0-9]+\/?$/i.test(url.pathname);
    }
    if (host !== "reddit.com" && !host.endsWith(".reddit.com")) {
      return false;
    }
    return (
      /\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(url.pathname) ||
      /\/comments\/[a-z0-9]+/i.test(url.pathname) ||
      /\/r\/[^/]+\/s\/[a-z0-9]+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
