import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

function trackTRPCRequests(page: Page) {
  const urls: Array<string> = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/trpc")) {
      urls.push(request.url());
    }
  });
  return urls;
}

test.describe("universal load", () => {
  test("server renders prefetched data", async ({ request }) => {
    const response = await request.get("/universal");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(
      "Hello, universal at 1970-01-01T00:00:00.000Z",
    );
  });

  test("hydrates without another request", async ({ page }) => {
    const urls = trackTRPCRequests(page);
    await page.goto("/universal");
    await expect(page.getByTestId("greeting")).toHaveText(
      "Hello, universal at 1970-01-01T00:00:00.000Z",
    );
    await page.waitForLoadState("networkidle");
    expect(urls).toEqual([]);
  });

  test("fetches through the batch link on client navigation", async ({
    page,
  }) => {
    const urls = trackTRPCRequests(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Universal load" }).click();
    await expect(page.getByTestId("greeting")).toHaveText(
      "Hello, universal at 1970-01-01T00:00:00.000Z",
    );
    await page.waitForLoadState("networkidle");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/api/trpc/greeting?batch=1");
  });
});

test.describe("server load with dehydrateUnsent", () => {
  test("server renders layout and page data", async ({ request }) => {
    const response = await request.get("/server");
    const html = await response.text();
    expect(html).toContain("Server section");
    expect(html).toContain("Hello, server");
  });

  test("sends each query once across the layout and the page", async ({
    page,
  }) => {
    await page.goto("/server");
    const layoutHashes = await page.getByTestId("layout-hashes").textContent();
    const pageHashes = await page.getByTestId("page-hashes").textContent();
    expect(layoutHashes).toContain("layoutInfo");
    expect(pageHashes).not.toContain("layoutInfo");
    expect(pageHashes).toContain("greeting");
    expect(pageHashes).toContain("slow");
  });

  test("streams the pending slow query and resolves it without a refetch", async ({
    page,
  }) => {
    const urls = trackTRPCRequests(page);
    await page.goto("/server");
    await expect(page.getByTestId("layout-info")).toHaveText("Server section");
    await expect(page.getByTestId("greeting")).toHaveText("Hello, server");
    await expect(page.getByTestId("slow")).toHaveText(
      "slow done at 1970-01-01T00:00:00.000Z",
    );
    await page.waitForLoadState("networkidle");
    expect(urls).toEqual([]);
  });
});

test.describe("unstable handles", () => {
  test("server renders handle data and hydrates without requests", async ({
    page,
    request,
  }) => {
    const response = await request.get("/handles/1");
    const html = await response.text();
    expect(html).toContain("Post 1");

    const urls = trackTRPCRequests(page);
    await page.goto("/handles/1");
    await expect(page.getByTestId("post")).toHaveText("Post 1");
    await expect(page.getByTestId("viewer")).toHaveText("KATT");
    await expect(page.getByTestId("comments")).toHaveText("0,1");
    await page.waitForLoadState("networkidle");
    expect(urls).toEqual([]);
  });

  test("fetches the next page of an infinite handle", async ({ page }) => {
    await page.goto("/handles/1");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "more comments" }).click();
    await expect(page.getByTestId("comments")).toHaveText("0,1,2,3");
  });

  test("maps a NOT_FOUND entry to a 404", async ({ request }) => {
    const response = await request.get("/handles/missing");
    expect(response.status()).toBe(404);
  });
});

test.describe("mutations and subscriptions", () => {
  test("invalidates through pathFilter after a mutation", async ({ page }) => {
    await page.goto("/live");
    const counter = page.getByTestId("counter");
    await expect(counter).toHaveText(/^\d+$/);
    const before = Number(await counter.textContent());
    await page.getByRole("button", { name: "increment" }).click();
    await expect(counter).toHaveText(String(before + 1));
  });

  test("receives subscription events over SSE", async ({ page }) => {
    await page.goto("/live");
    await expect(page.getByTestId("ticks")).toHaveText("ticks:0,1,2");
  });
});
