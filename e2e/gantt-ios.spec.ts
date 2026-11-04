import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, openPlanning } from "./helpers";

const POINTER_ID = 3;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("appui long iOS : le doigt déplace la course et la grille ne défile pas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone", "WebKit iPhone 13, 390×844, hasTouch");
  test.setTimeout(180_000);
  await openPlanning(page);

  await test.step("l'appui long laisse défiler, puis le doigt déplace sans scroller", async () => {
    const moved = await dragCandidates(page, async (from) => {
      const before = await gridScroll(page);
      const to = { x: from.x + 140, y: from.y };
      await finger(page, "down", from);
      const duringHold = await finger(page, "touch", { x: from.x + 4, y: from.y });
      expect(duringHold.prevented).toBe(false);
      await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "pending");
      expect(await gridScroll(page)).toEqual(before);
      await page.waitForTimeout(520);
      await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
      const dragging = await finger(page, "move", to);
      expect(await gridScroll(page)).toEqual(before);
      expect(dragging.prevented).toBe(true);
      await frame(page);
      await expect(page.locator(`[data-transport-id="${from.id}"]`)).toHaveAttribute("style", /translate/);
      await page.screenshot({ path: "/opt/cursor/artifacts/dnd1_drag_390.png", scale: "css" });
      expect(await gridScroll(page)).toEqual(before);
      await finger(page, "up", to);
      await frame(page);
      expect(await gridScroll(page)).toEqual(before);
    });
    expect(moved).toBe(true);
  });

  await test.step("un pointercancel iOS, le doigt encore posé, ne coupe pas le drag", async () => {
    const moved = await dragCandidates(page, async (from) => {
      const before = await gridScroll(page);
      const to = { x: from.x + 140, y: from.y };
      await finger(page, "down", from);
      await page.waitForTimeout(520);
      await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
      await finger(page, "cancel", from);
      await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
      const dragging = await finger(page, "touch", to);
      expect(dragging.prevented).toBe(true);
      await frame(page);
      await expect(page.locator(`[data-transport-id="${from.id}"]`)).toHaveAttribute("style", /translate/);
      expect(await gridScroll(page)).toEqual(before);
      await finger(page, "up", to);
      await frame(page);
      await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
      expect(await gridScroll(page)).toEqual(before);
    });
    expect(moved).toBe(true);
  });
});

async function dragCandidates(
  page: Page,
  gesture: (from: { id: string; x: number; y: number; depart: number; crew: string }) => Promise<void>,
) {
  const candidates = (await bars(page)).filter(
    (item) => item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 8 * 60,
  );
  expect(candidates.length).toBeGreaterThan(0);
  for (const candidate of candidates.slice(0, 6)) {
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
    await expect(page.locator("[data-return]")).toHaveCount(0);
    await center(page, candidate.id);
    const from = await barById(page, candidate.id);
    await gesture(from);
    const after = await barById(page, from.id);
    if (after.depart !== from.depart || after.crew !== from.crew) {
      expect(after.depart % 5).toBe(0);
      return true;
    }
  }
  return false;
}

async function gridScroll(page: Page) {
  return page.evaluate(() => {
    const node = document.querySelector(".gantt-scroll");
    return {
      left: node instanceof HTMLElement ? node.scrollLeft : -1,
      top: node instanceof HTMLElement ? node.scrollTop : -1,
    };
  });
}

async function frame(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function finger(page: Page, phase: "down" | "touch" | "move" | "up" | "cancel", point: { x: number; y: number }) {
  return page.evaluate(
    ({ phase, point, pointerId }) => {
      const hit = document.elementFromPoint(point.x, point.y);
      const node = hit instanceof Element ? (hit.closest(".gantt-block") ?? hit) : document.body;
      // WebKit de Playwright n'expose pas `new Touch()`. createTouch est le chemin supporté.
      const doc = document as unknown as {
        createTouch: (
          view: Window,
          target: Element,
          identifier: number,
          pageX: number,
          pageY: number,
          screenX: number,
          screenY: number,
        ) => Touch;
        createTouchList: (...touches: Touch[]) => TouchList;
      };
      let prevented = false;
      if (phase !== "cancel") {
        const touchType = phase === "down" ? "touchstart" : phase === "up" ? "touchend" : "touchmove";
        const ended = phase === "up";
        const touch = doc.createTouch(window, node, pointerId, point.x, point.y, point.x, point.y);
        const list = ended ? doc.createTouchList() : doc.createTouchList(touch);
        const changed = doc.createTouchList(touch);
        const touchEvent = new TouchEvent(touchType, {
          bubbles: true,
          cancelable: true,
          touches: list,
          targetTouches: list,
          changedTouches: changed,
        });
        (phase === "down" ? node : window).dispatchEvent(touchEvent);
        prevented = touchEvent.defaultPrevented;
      }
      if (phase !== "touch") {
        const pointerType =
          phase === "down"
            ? "pointerdown"
            : phase === "up"
              ? "pointerup"
              : phase === "cancel"
                ? "pointercancel"
                : "pointermove";
        const pointerEvent = new PointerEvent(pointerType, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerType: "touch",
          pointerId,
          isPrimary: true,
          buttons: phase === "down" || phase === "move" ? 1 : 0,
        });
        (phase === "down" ? node : window).dispatchEvent(pointerEvent);
      }
      return { prevented };
    },
    { phase, point, pointerId: POINTER_ID },
  );
}
