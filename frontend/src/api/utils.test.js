// Modified for Personal File Relay: protected API session-loss regression tests (2026-11-05).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { expired, loggedIn, restore } = vi.hoisted(() => ({ expired: vi.fn(), loggedIn: vi.fn(() => true), restore: vi.fn(async () => false) }));
vi.mock('@/store', () => ({ state: { sessionId: 'test-session' }, getters: { isLoggedIn: loggedIn } }));
vi.mock('@/utils/auth', () => ({ sessionExpired: expired, restoreRememberedSession: restore }));

vi.mock('@/utils/constants', () => {
  return {
    globalVars: {
      baseURL: "unit-testing",
      name: "Test App",
      mediaAvailable: true,
      muPdfAvailable: true,
      onlyOfficeUrl: "",
      recaptcha: false,
      recaptchaKey: "",
      darkMode: false,
      oidcAvailable: false,
      passwordAvailable: true,
      externalUrl: "",
      minSearchLength: 1,
      disableNavButtons: false,
      userSelectableThemes: {},
      enableThumbs: true,
      noAuth: false,
      signup: false,
      version: "test",
      commitSHA: "test",
      disableExternal: false,
      externalLinks: [],
      updateAvailable: "",
    },
    logoURL: "test-logo.png",
    origin: "http://localhost",
    settings: [],
  };
});

import { adjustedData, fetchURL } from './utils.js';

describe('protected API authentication failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggedIn.mockReturnValue(true);
    restore.mockResolvedValue(false);
    vi.stubGlobal('location', { origin: 'https://relay.example.test', href: 'https://relay.example.test/chat' });
  });
  afterEach(() => vi.unstubAllGlobals());
  const respond = status => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, text: async () => 'request failed' }));
  it('returns to login on a same-origin protected resource 401', async () => {
    respond(401);
    await expect(fetchURL('/api/resources?path=%2F')).rejects.toMatchObject({ status: 401, sessionExpired: true });
    expect(expired).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/resources?path=%2F', expect.objectContaining({ credentials: 'same-origin' }));
  });
  it.each(['/public/api/resources', '/api/auth/login', 'https://other.example.test/api/resources'])(
    'does not redirect for public, login or foreign requests: %s', async url => {
      respond(401);
      await expect(fetchURL(url)).rejects.toMatchObject({ status: 401 });
      expect(expired).not.toHaveBeenCalled();
    });
  it('respects the explicit unauthenticated flag and logged-out state', async () => {
    respond(401);
    await expect(fetchURL('/api/resources', {}, false)).rejects.toMatchObject({ status: 401 });
    loggedIn.mockReturnValue(false);
    await expect(fetchURL('/api/resources')).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
  });
  it('does not log out for server errors', async () => {
    respond(500);
    await expect(fetchURL('/api/resources')).rejects.toMatchObject({ status: 500 });
    expect(expired).not.toHaveBeenCalled();
  });
  it('restores once and retries the identical protected request', async () => {
    restore.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 401, text: async () => 'expired' }).mockResolvedValueOnce({ status: 200 }));
    await expect(fetchURL('/api/resources', { method: 'POST', body: 'synthetic' })).resolves.toMatchObject({ status: 200 });
    expect(restore).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2); expect(expired).not.toHaveBeenCalled();
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', body: 'synthetic' });
  });
  it('does not erase a remembered browser when restoration is temporarily unavailable', async () => {
    respond(401); restore.mockRejectedValue(Object.assign(new Error('outage'), { status: 500 }));
    await expect(fetchURL('/api/resources')).rejects.toMatchObject({ status: 500 }); expect(expired).not.toHaveBeenCalled();
  });
});

describe('adjustedData', () => {
  it('should append the URL and process directory data correctly', () => {
    const input = {
      type: "directory",
      folders: [
        { name: "folder1", type: "directory" },
        { name: "folder2", type: "directory" },
      ],
      files: [
        { name: "file1.txt", type: "file" },
        { name: "file2.txt", type: "file" },
      ],
      path: "/root/"
    };

    const expected = {
      type: "directory",
      folders: [],
      files: [],
      items: [
        { isShared: false, name: "folder1", path: "/root/folder1/", source: undefined, type: "directory", pinned: false },
        { isShared: false, name: "folder2", path: "/root/folder2/", source: undefined, type: "directory", pinned: false },
        { isShared: false, name: "file1.txt", path: "/root/file1.txt", source: undefined, type: "file", pinned: false },
        { isShared: false, name: "file2.txt", path: "/root/file2.txt", source: undefined, type: "file", pinned: false },
      ],
      path: "/root/",
    };

    expect(adjustedData(input)).toEqual(expected);
  });

  it('should add a trailing slash to the URL if missing for a directory', () => {
    const input = { type: "directory", folders: [], files: [] };

    const expected = {
      type: "directory",
      folders: [],
      files: [],
      items: [],
    };

    expect(adjustedData(input)).toEqual(expected);
  });

  it('should handle non-directory types without modification to items', () => {
    const input = { type: "file", name: "file1.txt" };

    const expected = {
      type: "file",
      name: "file1.txt",
    };

    expect(adjustedData(input)).toEqual(expected);
  });

  it('should handle missing folders and files gracefully', () => {
    const input = { type: "directory" };
    const expected = {
      type: "directory",
      items: [],
    };

    expect(adjustedData(input)).toEqual(expected);
  });

  it('should handle empty input object correctly', () => {
    const input = {};
    const expected = {};
    expect(adjustedData(input)).toEqual(expected);
  });

  it('marks items as pinned from directory pinnedItems names', () => {
    const input = {
      type: "directory",
      path: "/",
      pinnedItems: ["alpha.txt"],
      folders: [{ name: "docs", type: "directory" }],
      files: [
        { name: "alpha.txt", type: "file" },
        { name: "beta.txt", type: "file" },
      ],
      source: "Docs",
    };

    const result = adjustedData(input);

    expect(result.pinnedItems).toBeUndefined();
    expect(result.items).toEqual([
      { isShared: false, name: "docs", path: "/docs/", source: "Docs", type: "directory", pinned: false },
      { isShared: false, name: "alpha.txt", path: "/alpha.txt", source: "Docs", type: "file", pinned: true },
      { isShared: false, name: "beta.txt", path: "/beta.txt", source: "Docs", type: "file", pinned: false },
    ]);
  });

});
