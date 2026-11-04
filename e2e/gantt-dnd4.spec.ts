import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, openPlanning, type Bar } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
    const calls: number[] = [];
    (window as Window & { __ambuxVibrate?: number[] }).__ambuxVibrate = calls;
    try {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (pattern: number | number[]) => {
          calls.push(typeof pattern === "number" ? pattern : (pattern[0] ?? 0));
          return true;
        },
      });
    } catch {
      /* vibrate non configurable */
    }
  });
});

test("le bord défile plus vite que l'entrée, à droite de la colonne", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const expectedColumn = testInfo.project.name === "phone" ? 104 : 156;
  const columnWidth = await page
    .locator("[data-crew-column]")
    .evaluate((node) => Math.round(node.getBoundingClientRect().width));
  expect(columnWidth).toBe(expectedColumn);

  expect(await armDrag(page)).toBe(true);
  const geom = await geometry(page);
  expect(geom.height).toBeGreaterThan(160);
  const y = geom.top + 80;

  await park(page, geom);
  const parked = await scrollOf(page);
  await page.mouse.move(geom.left + 8, y);
  await frames(page, 8);
  const onColumn = await scrollOf(page);
  expect(Math.abs(onColumn.left - parked.left)).toBeLessThan(3);

  const slow = await drift(page, geom.columnRight + 50, y, "left");
  const fast = await drift(page, geom.columnRight + 2, y, "left");
  console.log(`EDGE_X ${testInfo.project.name} entrée=${slow.toFixed(2)} bord=${fast.toFixed(2)}`);
  expect(slow).toBeGreaterThan(0.4);
  expect(slow).toBeLessThan(8);
  expect(fast).toBeGreaterThan(8);
  expect(fast).toBeGreaterThan(slow * 2);

  await page.locator(".gantt-scroll").evaluate((node) => {
    (node as HTMLElement).style.maxHeight = "220px";
  });
  const shrunk = await geometry(page);
  const x = Math.min(shrunk.columnRight + 90, shrunk.right - 70);
  const slowY = await drift(page, x, shrunk.bottom - 50, "top");
  const fastY = await drift(page, x, shrunk.bottom - 2, "top");
  console.log(`EDGE_Y ${testInfo.project.name} entrée=${slowY.toFixed(2)} bord=${fastY.toFixed(2)}`);
  expect(slowY).toBeGreaterThan(0.4);
  expect(slowY).toBeLessThan(8);
  expect(fastY).toBeGreaterThan(8);
  expect(fastY).toBeGreaterThan(slowY * 2);

  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("un refus, Échap ou un relâchement hors grille ramène le bloc", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPlanning(page);

  const refused = await holdRefused(page);
  expect(refused, "aucun refus VSL").toBeTruthy();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/dnd4-confort-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/dnd4-confort-1440.png", scale: "css" });
  }
  await page.mouse.up();
  await expectReturn(page, refused!.id);
  expect((await barById(page, refused!.id)).depart).toBe(refused!.depart);
  expect((await barById(page, refused!.id)).crew).toBe(refused!.crew);
  await expect(page.locator("[role='status']")).toContainText(/Incompatibilité|Conflit horaire/);
  await expect(page.locator(`[data-transport-id="${refused!.id}"]`)).not.toHaveAttribute("data-return", "1");

  const from = await barById(page, refused!.id);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 48, from.y, { steps: 6 });
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
  await page.keyboard.press("Escape");
  await expectReturn(page, from.id);
  await page.mouse.up();
  expect((await barById(page, from.id)).depart).toBe(from.depart);

  const again = await barById(page, from.id);
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(again.x + 36, again.y, { steps: 4 });
  const spot = await pointOutside(page);
  expect(spot).toBeTruthy();
  const beforeToast = (await page.locator("[role='status']").count())
    ? await page.locator("[role='status']").innerText()
    : "";
  await page.mouse.move(spot!.x, spot!.y);
  await page.mouse.up();
  await expectReturn(page, again.id);
  const afterToast = (await page.locator("[role='status']").count())
    ? await page.locator("[role='status']").innerText()
    : "";
  expect(afterToast).toBe(beforeToast);
  expect((await barById(page, again.id)).depart).toBe(again.depart);
  expect((await barById(page, again.id)).crew).toBe(again.crew);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const quiet = await barById(page, again.id);
  await page.mouse.move(quiet.x, quiet.y);
  await page.mouse.down();
  await page.mouse.move(quiet.x + 40, quiet.y, { steps: 4 });
  await page.keyboard.press("Escape");
  const block = page.locator(`[data-transport-id="${quiet.id}"]`);
  await expect(block).toHaveAttribute("data-return", "1");
  await expect(block).toHaveCSS("transition-duration", "0s");
  await page.mouse.up();
  expect((await barById(page, quiet.id)).depart).toBe(quiet.depart);
});

test("un appui de 300 ms soulève le bloc puis arme le drag", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "appui long, Chrome 390×844");
  test.setTimeout(120_000);
  await openPlanning(page);
  const sample = (await bars(page)).find((item) => item.depart >= 8 * 60) ?? (await bars(page))[0];
  expect(sample).toBeTruthy();
  await center(page, sample!.id);
  const from = await barById(page, sample!.id);

  await touch(page, "pointerdown", from.x, from.y, 4);
  await page.waitForFunction(() => performance.now() - (window as unknown as { __holdT0: number }).__holdT0 >= 180);
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "pending");
  const lift = await page.locator(`[data-transport-id="${from.id}"]`).evaluate((node) => {
    const style = getComputedStyle(node);
    const raw = style.transform;
    const scale = raw.startsWith("matrix(") ? Number(raw.slice(7).split(",")[0]) : 1;
    return {
      scale,
      shadow: style.boxShadow,
      pending: node.classList.contains("gantt-pending"),
      duration: style.animationDuration,
    };
  });
  expect(lift.pending).toBe(true);
  expect(lift.duration === "0.3s" || lift.duration === "300ms").toBe(true);
  expect(lift.scale).toBeGreaterThan(1.008);
  expect(lift.scale).toBeLessThan(1.04);
  expect(lift.shadow).not.toBe("none");
  await page.waitForFunction(() => document.querySelector("[data-gesture]")?.getAttribute("data-gesture") === "drag");
  const elapsed = await page.evaluate(() => performance.now() - (window as unknown as { __holdT0: number }).__holdT0);
  expect(elapsed).toBeGreaterThanOrEqual(280);
  expect(elapsed).toBeLessThan(420);
  const buzzes = await page.evaluate(() => (window as unknown as { __ambuxVibrate?: number[] }).__ambuxVibrate ?? []);
  expect(buzzes).toContain(10);
  await touch(page, "pointerup", from.x, from.y, 4);

  const still = await barById(page, from.id);
  await touch(page, "pointerdown", still.x, still.y, 5);
  await touch(page, "pointermove", still.x + 12, still.y, 5);
  await page.waitForFunction(() => performance.now() - (window as unknown as { __holdT0: number }).__holdT0 >= 380);
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "scroll");
  await touch(page, "pointerup", still.x + 12, still.y, 5);
  expect((await barById(page, from.id)).depart).toBe(from.depart);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const quiet = await barById(page, from.id);
  await touch(page, "pointerdown", quiet.x, quiet.y, 6);
  await page.waitForTimeout(140);
  const flat = await page.locator(`[data-transport-id="${quiet.id}"]`).evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
  });
  expect(flat).toBe(true);
  await touch(page, "pointerup", quiet.x, quiet.y, 6);
});

async function armDrag(page: Page) {
  const candidates = (await bars(page)).filter((item) => item.posture === "assis" && item.depart >= 8 * 60);
  for (const candidate of candidates.slice(0, 6)) {
    await center(page, candidate.id);
    const from = await barById(page, candidate.id);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 18, from.y, { steps: 3 });
    if ((await page.locator("[data-gesture]").getAttribute("data-gesture")) === "drag") return true;
    await page.mouse.up();
  }
  return false;
}

async function park(page: Page, geom: Viewport) {
  const x = Math.min(geom.columnRight + 140, geom.right - 80);
  const y = geom.top + 80;
  await page.mouse.move(x, y);
  await frames(page, 2);
  await page.locator(".gantt-scroll").evaluate((node) => {
    const el = node as HTMLElement;
    el.scrollLeft = Math.min(420, Math.max(0, el.scrollWidth - el.clientWidth));
    el.scrollTop = 0;
  });
  await frames(page, 2);
}

async function drift(page: Page, x: number, y: number, axis: "left" | "top") {
  await page.locator(".gantt-scroll").evaluate((node, which) => {
    const el = node as HTMLElement;
    if (which === "left") el.scrollLeft = Math.min(420, Math.max(0, el.scrollWidth - el.clientWidth));
    else el.scrollTop = 8;
  }, axis);
  await page.mouse.move(x, y);
  await frames(page, 2);
  const start = await scrollOf(page);
  await frames(page, 5);
  const end = await scrollOf(page);
  const delta = axis === "left" ? start.left - end.left : end.top - start.top;
  return delta / 5;
}

type Viewport = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  height: number;
  columnRight: number;
};

async function geometry(page: Page): Promise<Viewport> {
  const geom = await page.evaluate(() => {
    const scroller = document.querySelector(".gantt-scroll");
    const column = document.querySelector("[data-crew-column]");
    if (!(scroller instanceof HTMLElement) || !(column instanceof HTMLElement)) return null;
    const box = scroller.getBoundingClientRect();
    const col = column.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      height: box.height,
      columnRight: col.right,
    };
  });
  expect(geom).toBeTruthy();
  return geom!;
}

async function scrollOf(page: Page) {
  return page.locator(".gantt-scroll").evaluate((node) => ({
    left: (node as HTMLElement).scrollLeft,
    top: (node as HTMLElement).scrollTop,
  }));
}

async function frames(page: Page, count: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = () => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

async function expectReturn(page: Page, id: string) {
  const block = page.locator(`[data-transport-id="${id}"]`);
  await expect(block).toHaveAttribute("data-return", "1");
  await expect(block).toHaveClass(/gantt-returning/);
  const duration = await block.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(duration === "0.18s" || duration === "180ms").toBe(true);
}

async function holdRefused(page: Page): Promise<Bar | null> {
  const allonge = (await bars(page)).find((item) => item.posture === "allonge" && item.depart >= 8 * 60);
  if (!allonge) return null;
  await center(page, allonge.id);
  const from = await barById(page, allonge.id);
  const track = page.locator("[data-track][data-vehicle='vsl']").first();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await track.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  const point = await track.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const label = node.previousElementSibling;
    const labelRight = label instanceof HTMLElement ? label.getBoundingClientRect().right : rect.left;
    const left = Math.max(rect.left + 8, labelRight + 8);
    const right = Math.min(rect.right - 8, window.innerWidth - 12);
    return { x: (left + right) / 2, y: rect.top + rect.height / 2, left, right };
  });
  const view = page.viewportSize();
  if (!view || point.right - point.left < 12 || point.y < 80 || point.y > view.height - 80) {
    await page.keyboard.press("Escape");
    await page.mouse.up();
    return null;
  }
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await frames(page, 2);
  if ((await page.locator("[data-ghost][data-preview='invalid']").count()) !== 1) {
    await page.keyboard.press("Escape");
    await page.mouse.up();
    return null;
  }
  return from;
}

async function pointOutside(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".gantt-scroll");
    if (!(scroller instanceof HTMLElement)) return null;
    const box = scroller.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 12, Math.max(12, box.left + 160));
    for (const y of [8, 16, 28, box.top - 12]) {
      if (y < 1) continue;
      const hit = document.elementFromPoint(x, y);
      if (!(hit instanceof Element)) return { x, y };
      if (!hit.closest(".gantt-scroll, [data-track], [data-unassigned]")) return { x, y };
    }
    return null;
  });
}

async function touch(
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
  pointerId: number,
) {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
      if (type === "pointerdown") (window as unknown as { __holdT0?: number }).__holdT0 = performance.now();
      const target = type === "pointerdown" ? document.elementFromPoint(x, y) : window;
      if (!target) throw new Error(`pas de cible ${type}`);
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerType: "touch",
          pointerId,
          isPrimary: true,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    },
    { type, x, y, pointerId },
  );
}
