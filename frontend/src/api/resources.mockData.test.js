// Modified for Personal File Relay: directory authorization regression tests (2026-11-05).
import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchURLMock, stateMock } = vi.hoisted(() => ({
  fetchURLMock: vi.fn(),
  stateMock: {
    route: { path: "/files/mockData", query: {} },
    sessionId: "test-session",
    shareInfo: { subPath: "", hash: "", token: "" },
  },
}));

vi.mock("@/utils/constants", () => ({
  globalVars: {
    baseURL: "/",
    externalUrl: "",
    devMode: true,
    playwrightTest: false,
  },
}));

vi.mock("@/store", () => ({
  getters: { isShare: () => false },
  mutations: {},
  state: stateMock,
}));

vi.mock("@/notify", () => ({
  notify: { showError: vi.fn() },
}));

vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchURL: (...args) => fetchURLMock(...args),
  };
});

import { fetchFiles, listDirectoryEntries } from "@/api/resources";

describe('directory probe authentication', () => {
  it('propagates 401 instead of treating a protected directory as absent', async () => {
    fetchURLMock.mockRejectedValueOnce(Object.assign(new Error('no token'), { status: 401 }));
    await expect(listDirectoryEntries('Personal', '/.text-relay/')).rejects.toMatchObject({ status: 401 });
  });
  it('retains the missing-directory behavior for 404', async () => {
    fetchURLMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    expect(await listDirectoryEntries('Personal', '/.text-relay/')).toBeNull();
  });
});

function mockListingResponse(numDirs, numFiles) {
  return {
    json: async () => ({
      folders: Array.from({ length: numDirs }, (_, i) => ({ name: `folder-${i}` })),
      files: Array.from({ length: numFiles }, (_, i) => ({
        name: `file-${i}.txt`,
        type: "blob",
      })),
    }),
  };
}

describe("fetchFiles mockData source", () => {
  beforeEach(() => {
    fetchURLMock.mockReset();
    stateMock.route.query = {};
  });

  it("calls mock-data with default counts of 1000", async () => {
    fetchURLMock.mockResolvedValue(mockListingResponse(2, 1));

    const result = await fetchFiles("mockData", "/");

    expect(fetchURLMock).toHaveBeenCalledTimes(1);
    const url = fetchURLMock.mock.calls[0][0];
    expect(url).toContain("api/mock-data");
    expect(url).toContain("numDirs=1000");
    expect(url).toContain("numFiles=1000");
    expect(result.type).toBe("directory");
    expect(result.source).toBe("mockData");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].type).toBe("directory");
  });

  it("passes numDirs and numFiles from route query", async () => {
    stateMock.route.query = { numDirs: "10", numFiles: "5" };
    fetchURLMock.mockResolvedValue(mockListingResponse(10, 5));

    await fetchFiles("mockData", "/");

    const url = fetchURLMock.mock.calls[0][0];
    expect(url).toContain("numDirs=10");
    expect(url).toContain("numFiles=5");
  });

  it("rejects non-root paths", async () => {
    await expect(fetchFiles("mockData", "/sub")).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchURLMock).not.toHaveBeenCalled();
  });
});
