import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, openPlanning } from "./helpers";

const DISTANCE = 300;
const STEPS = 80;

type DragStats = { board: number; row: number; frames: number; commits: number };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
    (
      window as Window & {
        __ambuxDragStats?: { board: number; row: number; frames: number; commits: number };
      }
    ).__ambuxDragStats = { board: 0, row: 0, frames: 0, commits: 0 };
  });
});

// Référence dnd-2, même geste (80 frames, 6 équipages, 2,4 px/min, Chrome 1440) :
// GanttBoard 80, CrewRow 480. Le plafond ici est le nombre de créneaux.
test("un drag de 300 px redessine selon les créneaux, pas selon les frames", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "mesure Chrome 1440×900");
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.waitForTimeout(400);

  const scroller = page.locator(".gantt-scroll");
  const box = await scroller.boundingBox();
  expect(box).toBeTruthy();
  const view = page.viewportSize();
  expect(view).toBeTruthy();

  const candidates = (await bars(page)).filter(
    (item) =>
      item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 10 * 60 && item.depart <= 15 * 60,
  );
  expect(candidates.length).toBeGreaterThan(0);

  let measured: (DragStats & { transform: string; ghost: boolean; markers: number; crews: number }) | null = null;
  let pxPerMin = 0;
  for (const candidate of candidates.slice(0, 4)) {
    await center(page, candidate.id);
    const from = await barById(page, candidate.id);
    if (!box || !view) continue;
    const x = from.x;
    const y = from.y;
    if (x < box.x + 48 || x + DISTANCE > box.x + box.width - 48) continue;
    if (y < box.y + 48 || y > box.y + box.height - 48) continue;
    if (x + DISTANCE > view.width - 24) continue;

    const scrollBefore = await scrollOf(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await frame(page);
    await frame(page);
    await resetStats(page);
    for (let step = 1; step <= STEPS; step++) {
      await page.mouse.move(x + (DISTANCE * step) / STEPS, y);
      await frame(page);
    }
    const scrollAfter = await scrollOf(page);
    measured = await readStats(page);
    pxPerMin = await pixelsPerMinute(page, from.id);
    await page.mouse.up();
    await frame(page);
    expect(scrollAfter).toEqual(scrollBefore);
    break;
  }

  expect(measured, "aucun drag horizontal de 300 px à l'écart du bord").toBeTruthy();
  const stats = measured!;
  console.log(`DRAG_MEASURE ${JSON.stringify({ ...stats, pxPerMin, steps: STEPS, distance: DISTANCE })}`);

  const slotPx = 5 * pxPerMin;
  const maxSlots = Math.ceil(DISTANCE / slotPx) + 3;
  expect(stats.markers).toBe(0);
  expect(stats.ghost).toBe(true);
  expect(stats.transform).toContain("translate");
  const dx = Number(/translate\(([-\d.]+)px/.exec(stats.transform)?.[1]);
  expect(Math.abs(dx)).toBeGreaterThan(250);
  expect(pxPerMin).toBeGreaterThan(0);
  expect(stats.frames).toBeGreaterThanOrEqual(60);
  expect(stats.commits).toBeGreaterThanOrEqual(8);
  expect(stats.commits).toBeLessThanOrEqual(maxSlots);
  expect(stats.board).toBeLessThanOrEqual(stats.commits);
  expect(stats.board).toBeLessThan(stats.frames / 2);
  expect(stats.row).toBeLessThanOrEqual(stats.commits * 2);
  expect(stats.row).toBeLessThan(stats.frames);
});

async function resetStats(page: Page) {
  await page.evaluate(() => {
    const stats = (
      window as Window & {
        __ambuxDragStats?: { board: number; row: number; frames: number; commits: number };
      }
    ).__ambuxDragStats;
    if (!stats) return;
    stats.board = 0;
    stats.row = 0;
    stats.frames = 0;
    stats.commits = 0;
  });
}

async function readStats(page: Page) {
  return page.evaluate(() => {
    const stats = (
      window as Window & {
        __ambuxDragStats?: { board: number; row: number; frames: number; commits: number };
      }
    ).__ambuxDragStats;
    const block = document.querySelector(".gantt-dragging");
    return {
      board: stats?.board ?? -1,
      row: stats?.row ?? -1,
      frames: stats?.frames ?? -1,
      commits: stats?.commits ?? -1,
      transform: block instanceof HTMLElement ? block.style.transform : "",
      ghost: Boolean(document.querySelector("[data-ghost]")),
      markers: document.querySelectorAll("[title^='Heure prévue']").length,
      crews: document.querySelectorAll("[data-track]").length,
    };
  });
}

async function scrollOf(page: Page) {
  return page.locator(".gantt-scroll").evaluate((node) => ({
    left: (node as HTMLElement).scrollLeft,
    top: (node as HTMLElement).scrollTop,
  }));
}

async function pixelsPerMinute(page: Page, id: string) {
  return page.locator(`[data-transport-id="${id}"]`).evaluate((node) => {
    const depart = Number(node.getAttribute("data-depart"));
    const left = Number.parseFloat((node as HTMLElement).style.left);
    return left / (depart - 6 * 60);
  });
}

async function frame(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
}
