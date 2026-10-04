import { expect, test } from "@playwright/test";

import { NAV_GROUPS } from "../../src/lib/nav";

/**
 * The landing page at `/`.
 *
 * It is public and static: no cookie is read, no API is called, and it renders
 * the same bytes for a signed-out visitor and a signed-in operator. What is
 * worth testing here is what the page promises a reader: that its claims about
 * the console come from the console's own navigation, that a keyboard can get
 * through it, and that loading it contacts nobody.
 */

const SCREEN_COUNT = NAV_GROUPS.reduce((total, group) => total + group.items.length, 0);

test.describe("landing page", () => {
  test("names itself once and marks out the page's regions", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Scaling Trust\s*for digital age\./,
    );
    await expect(page.locator("main#main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Page sections" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Project links" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("a keyboard reaches the content without tabbing through the nav", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skip = page.locator(".lp-skip");
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    // Focus, not just scroll: without a focusable target the next Tab returns to
    // the top of the page and the skip link has done nothing.
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("every section link points at a section that exists", async ({ page }) => {
    await page.goto("/");

    const hrefs = await page
      .getByRole("navigation", { name: "Page sections" })
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

    expect(hrefs).toEqual(["#own", "#auth", "#security", "#ai", "#backends", "#console"]);
    for (const href of hrefs) {
      await expect(page.locator(href)).toHaveCount(1);
    }
  });

  test("the console map is the console's own navigation, read-only tags included", async ({
    page,
  }) => {
    await page.goto("/");

    const groups = page.locator(".lp-console-group");
    await expect(groups).toHaveCount(NAV_GROUPS.length);

    for (const [index, group] of NAV_GROUPS.entries()) {
      const container = groups.nth(index);
      await expect(container.locator(".lp-console-label")).toHaveText(group.label);

      const items = container.locator("li");
      await expect(items).toHaveCount(group.items.length);

      for (const [itemIndex, item] of group.items.entries()) {
        const row = items.nth(itemIndex);
        // The label is the console's, so the marketing list cannot drift from
        // the sidebar. The read-only tag is the AI invariant, made visible.
        await expect(row).toContainText(item.label);
        await expect(row.locator("em.tier-tag")).toHaveCount(item.readOnly === true ? 1 : 0);
      }
    }

    await expect(page.locator("#console .lp-h2")).toHaveText(
      `${SCREEN_COUNT} screens over the CLI.`,
    );
    await expect(page.locator(".tier-tag")).toHaveCount(4);
  });

  test("Open console leads to the console, which asks for a sign-in when signed out", async ({
    page,
  }) => {
    await page.goto("/");

    await page.locator(".lp-nav-cta").click();
    // The console group is compiled on its first visit in dev, which can take
    // longer than the default 5s on a cold server, so this one assertion waits
    // for the redirect rather than for a compile.
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("loading it contacts nobody outside this deployment", async ({ page }) => {
    const external: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.host !== "localhost:3000") external.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });

    // Ground rule: the fonts are self-hosted, so a production build makes no
    // request to a font CDN, and the console has no analytics at all.
    expect(external).toEqual([]);
    expect(pageErrors).toEqual([]);
    await expect(page.locator('link[href*="fonts."]')).toHaveCount(0);
    await expect(page.locator('script[src^="http"]')).toHaveCount(0);
  });

  test("fits a 375 pixel viewport without anything sticking out", async ({ page }) => {
    await page.goto("/");

    // Measured inside an iframe of exactly that width. Headless Chrome clamps
    // the window, so a narrow viewport set on the page itself would report a
    // layout the operator never sees.
    const layout = await page.evaluate(async () => {
      const frame = document.createElement("iframe");
      frame.setAttribute("title", "narrow");
      frame.style.cssText = "width:375px;height:900px;border:0";
      frame.src = "/";
      document.body.append(frame);
      await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));

      const doc = frame.contentDocument;
      if (doc === null) throw new Error("the harness iframe did not load");

      let widest = 0;
      let widestName = "";
      for (const element of doc.querySelectorAll("*")) {
        const right = element.getBoundingClientRect().right;
        if (right > widest) {
          widest = right;
          widestName = element.className || element.tagName;
        }
      }

      // The grid collapses to one column, so cards are not squeezed side by side.
      const grid = doc.querySelector(".lp-console-grid");
      const columns =
        grid === null ? "" : getComputedStyle(grid).gridTemplateColumns.split(" ").length;

      const navLinks = doc.querySelector(".lp-nav-links");

      return {
        scrollWidth: doc.documentElement.scrollWidth,
        clientWidth: doc.documentElement.clientWidth,
        widest,
        widestName,
        columns,
        navLinksHidden: navLinks === null ? null : getComputedStyle(navLinks).display,
      };
    });

    expect(layout.clientWidth).toBe(375);
    expect(layout.scrollWidth, `widest element: ${layout.widestName}`).toBeLessThanOrEqual(375);
    expect(layout.widest, `widest element: ${layout.widestName}`).toBeLessThanOrEqual(375);
    expect(layout.columns).toBe(1);
    // The section links are dropped at this width, and the call to action stays.
    expect(layout.navLinksHidden).toBe("none");
    await expect(page.locator(".lp-nav-cta")).toBeVisible();
  });

  test("a link shows a focus ring when a keyboard reaches it", async ({ page }) => {
    await page.goto("/");

    // Skip link, brand, then the first section link.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const first = page.getByRole("navigation", { name: "Page sections" }).getByRole("link").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveCSS("outline-style", "solid");
    await expect(first).toHaveCSS("outline-width", "2px");
  });
});
