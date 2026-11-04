import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, openPlanning, type Bar } from "./helpers";

const TEAL = "rgb(46, 196, 182)";
const CORAL = "rgb(255, 122, 107)";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("le fantôme suit le créneau aimanté pendant le drag", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPlanning(page);

  await test.step("un drag faisable pose un fantôme teal à l'heure calée", async () => {
    const held = await holdFeasible(page);
    expect(held, "aucun créneau faisable").toBeTruthy();
    await expectGhost(page, "ok", TEAL);
    await expectFaded(page, held!.id);
    await expect(page.locator("[data-drag-label]")).toHaveCount(0);
    await expect(page.locator("[data-unassigned] [data-ghost]")).toHaveCount(0);
    await expect(page.locator("[title^='Heure prévue']")).toHaveCount(0);
    if (testInfo.project.name === "phone") {
      await page.screenshot({ path: "/opt/cursor/artifacts/dnd3-drag-390.png", scale: "css" });
    }
    if (testInfo.project.name === "desktop") {
      await page.screenshot({ path: "/opt/cursor/artifacts/dnd3-drag-1440.png", scale: "css" });
    }
    const before = await barById(page, held!.id);
    await page.keyboard.press("Escape");
    await frame(page);
    await expect(page.locator("[data-ghost]")).toHaveCount(0);
    await page.mouse.up();
    await frame(page);
    await expect(page.locator("[data-ghost]")).toHaveCount(0);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
    const after = await barById(page, held!.id);
    expect(after.depart).toBe(before.depart);
    expect(after.crew).toBe(before.crew);
  });

  await test.step("un drag refusé pose un fantôme corail, le relâchement l'efface", async () => {
    const held = await holdRefused(page);
    expect(held, "aucun refus VSL").toBeTruthy();
    const ghost = page.locator("[data-ghost][data-preview='invalid']");
    await expect(ghost).toBeVisible();
    await expect(ghost).toContainText(/VSL|DEA|Conflit/);
    await expectGhost(page, "invalid", CORAL);
    await expectFaded(page, held!.id);
    if (testInfo.project.name === "phone") {
      await page.screenshot({ path: "/opt/cursor/artifacts/dnd2-fantome-refuse-390.png", scale: "css" });
    }
    if (testInfo.project.name === "desktop") {
      await page.screenshot({ path: "/opt/cursor/artifacts/dnd2-fantome-refuse-1440.png", scale: "css" });
    }
    await page.mouse.up();
    await frame(page);
    await expect(page.locator("[data-ghost]")).toHaveCount(0);
    const after = await barById(page, held!.id);
    expect(after.depart).toBe(held!.depart);
    expect(after.crew).toBe(held!.crew);
  });

  await test.step("Échap retire le fantôme refusé sans déplacer la course", async () => {
    const held = await holdRefused(page);
    expect(held).toBeTruthy();
    await expect(page.locator("[data-ghost]")).toBeVisible();
    await page.keyboard.press("Escape");
    await frame(page);
    await expect(page.locator("[data-ghost]")).toHaveCount(0);
    await page.mouse.up();
    await frame(page);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
    const after = await barById(page, held!.id);
    expect(after.depart).toBe(held!.depart);
    expect(after.crew).toBe(held!.crew);
  });

  await test.step("À placer ne montre pas de fantôme", async () => {
    await page.getByRole("button", { name: "À placer" }).click();
    await expect(page.locator("[data-unassigned]")).toBeVisible();
    await expect(page.locator("[data-ghost]")).toHaveCount(0);
  });
});

async function holdFeasible(page: Page): Promise<Bar | null> {
  const candidates = (await bars(page)).filter(
    (item) =>
      item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 8 * 60 && item.depart <= 17 * 60,
  );
  for (const candidate of candidates.slice(0, 8)) {
    await center(page, candidate.id);
    const from = await barById(page, candidate.id);
    const px = await pixelsPerMinute(page, from.id);
    const view = page.viewportSize();
    if (!view || px <= 0) continue;
    for (const shift of [0, 25, -20, 45, 60]) {
      const x = from.x + shift * px;
      const y = from.y + (shift === 0 ? 10 : 0);
      if (x < 120 || x > view.width - 16 || y < 90 || y > view.height - 90) continue;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 8 });
      await frame(page);
      const ghost = page.locator("[data-ghost]");
      if ((await ghost.count()) === 1 && (await ghost.getAttribute("data-preview")) === "ok") return from;
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await frame(page);
    }
  }
  return null;
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
    const labelRight = label instanceof HTMLElement ? label.getBoundingClientRect().right : 0;
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
  await frame(page);
  const ghost = page.locator("[data-ghost][data-preview='invalid']");
  if ((await ghost.count()) !== 1) {
    await page.keyboard.press("Escape");
    await page.mouse.up();
    return null;
  }
  return from;
}

async function expectGhost(page: Page, kind: "ok" | "invalid", border: string) {
  const ghost = page.locator(`[data-ghost][data-preview='${kind}']`);
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveCSS("border-top-color", border);
  const metrics = await ghost.evaluate((node) => {
    const el = node as HTMLElement;
    const source = document.querySelector(".gantt-dragging");
    const depart = Number(el.dataset.depart);
    const sourceDepart = source instanceof HTMLElement ? Number(source.dataset.depart) : 0;
    const sourceLeft = source instanceof HTMLElement ? Number.parseFloat(source.style.left) : Number.NaN;
    const px = sourceLeft / (sourceDepart - 6 * 60);
    const sourceWidth = source instanceof HTMLElement ? Number.parseFloat(source.style.width) : 0;
    return {
      depart,
      text: el.innerText,
      left: Number.parseFloat(el.style.left),
      width: Number.parseFloat(el.style.width),
      sourceWidth,
      expectedLeft: (depart - 6 * 60) * px,
      inTrack: Boolean(el.closest("[data-track]")),
      px,
    };
  });
  expect(metrics.inTrack).toBe(true);
  expect(metrics.px).toBeGreaterThan(0);
  expect(Math.round(metrics.depart) % 5).toBe(0);
  expect(metrics.text).toContain(clock(metrics.depart));
  expect(Math.abs(metrics.left - metrics.expectedLeft)).toBeLessThan(1.5);
  expect(Math.abs(metrics.width - metrics.sourceWidth)).toBeLessThan(4);
}

async function expectFaded(page: Page, id: string) {
  const block = page.locator(`[data-transport-id="${id}"]`);
  await expect(block).toHaveCSS("opacity", "0.6");
  const transform = await block.evaluate((node) => (node as HTMLElement).style.transform);
  expect(transform).toContain("translate");
  expect(transform).not.toContain("scale");
}

async function pixelsPerMinute(page: Page, id: string) {
  return page.locator(`[data-transport-id="${id}"]`).evaluate((node) => {
    const depart = Number(node.getAttribute("data-depart"));
    const left = Number.parseFloat((node as HTMLElement).style.left);
    return left / (depart - 6 * 60);
  });
}

function clock(min: number) {
  const value = Math.max(0, Math.round(min));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function frame(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
