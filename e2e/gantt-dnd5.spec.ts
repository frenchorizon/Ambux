import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, clickAction, openPlanning, type Bar } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("le clavier saisit une course, l'annonce et la repose", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPlanning(page);
  const live = page.locator("[data-live='keyboard']");
  await expect(live).toHaveAttribute("aria-live", "polite");

  const sample = (await bars(page)).find((item) => item.posture === "assis" && item.depart >= 8 * 60);
  expect(sample).toBeTruthy();
  const block = page.locator(`[data-transport-id="${sample!.id}"]`);
  await center(page, sample!.id);

  await test.step("le bloc est focusable, nommé, et la cible fait 44 px", async () => {
    await expect(block).toHaveAttribute("role", "button");
    const label = await block.getAttribute("aria-label");
    expect(label).toMatch(/,\s\d{2}:\d{2},\s(?:AMB|VSL)-\d+/);
    await expect(page.getByRole("button", { name: label! })).toHaveCount(1);
    await block.evaluate((el: HTMLElement) => {
      el.focus({ focusVisible: true });
    });
    await expect.poll(async () => block.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const outline = await block.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("solid");
    const hit = await block.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const before = getComputedStyle(node, "::before");
      return {
        width: box.width,
        height: box.height,
        beforeW: Number.parseFloat(before.width),
        beforeH: Number.parseFloat(before.height),
      };
    });
    expect(hit.beforeW).toBeGreaterThanOrEqual(44);
    expect(hit.beforeH).toBeGreaterThanOrEqual(44);
    expect(Math.max(hit.width, hit.beforeW)).toBeGreaterThanOrEqual(44);
    expect(Math.max(hit.height, hit.beforeH)).toBeGreaterThanOrEqual(44);
    if (testInfo.project.name === "desktop") expect(hit.height).toBeLessThan(44);
    else expect(hit.height).toBeGreaterThanOrEqual(44);
  });

  await test.step("Entrée vise, Maj décale de 15, Entrée pose", async () => {
    const candidates = (await bars(page)).filter(
      (item) =>
        item.posture === "assis" &&
        item.vehicle === "ambulance" &&
        item.depart >= 10 * 60 &&
        item.depart <= 15 * 60 &&
        item.depart % 5 === 0,
    );
    expect(candidates.length).toBeGreaterThan(0);
    let placed: Bar | null = null;
    for (const candidate of candidates.slice(0, 8)) {
      await pressGrab(page, candidate.id, "Enter");
      const before = await barById(page, candidate.id);
      await page.keyboard.press("ArrowRight");
      let ghost = await aimOf(page);
      if (ghost.preview !== "ok" || ghost.aim !== before.depart + 5) {
        await page.keyboard.press("Escape");
        continue;
      }
      await expect(live).toContainText(clock(ghost.depart));
      await page.keyboard.press("Shift+ArrowRight");
      ghost = await aimOf(page);
      if (ghost.preview !== "ok" || ghost.aim !== before.depart + 20) {
        await page.keyboard.press("Escape");
        continue;
      }
      expect((await barById(page, candidate.id)).depart).toBe(before.depart);
      expect((await barById(page, candidate.id)).crew).toBe(before.crew);
      await expect(live).toContainText(clock(ghost.depart));
      await expect(live).toContainText(/AMB-|VSL-/);
      if (testInfo.project.name === "phone") {
        await page.screenshot({ path: "/opt/cursor/artifacts/dnd5-390.png", scale: "css" });
      }
      if (testInfo.project.name === "desktop") {
        await page.screenshot({ path: "/opt/cursor/artifacts/dnd5-1440.png", scale: "css" });
      }
      const minute = ghost.depart;
      await page.keyboard.press("Enter");
      await expect(live).toContainText("Course posée");
      await expect(live).toContainText(clock(minute));
      const after = await barById(page, candidate.id);
      expect(after.depart).toBe(minute);
      expect(after.depart % 5).toBe(0);
      expect(after.crew).toBe(before.crew);
      await clickAction(page, "Annuler");
      expect((await barById(page, candidate.id)).depart).toBe(before.depart);
      expect((await barById(page, candidate.id)).crew).toBe(before.crew);
      placed = before;
      break;
    }
    expect(placed, "aucun créneau libre à +5 puis +15").toBeTruthy();
  });

  await test.step("Espace saisit, les flèches visent, Échap annule", async () => {
    const candidate = (await bars(page)).find(
      (item) =>
        item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 10 * 60 && item.depart % 5 === 0,
    );
    expect(candidate).toBeTruthy();
    await pressGrab(page, candidate!.id, "Space");
    const before = await barById(page, candidate!.id);
    await page.keyboard.press("ArrowLeft");
    const ghost = await aimOf(page);
    expect(ghost.aim).toBe(before.depart - 5);
    expect((await barById(page, candidate!.id)).depart).toBe(before.depart);
    const rows = await crewRows(page);
    const index = rows.findIndex((row) => row.id === before.crew);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(rows.length - 1);
    await page.keyboard.press("ArrowDown");
    const next = await aimOf(page);
    expect(next.crew).toBe(rows[index + 1]!.id);
    await expect(live).toContainText(rows[index + 1]!.code);
    expect((await barById(page, candidate!.id)).crew).toBe(before.crew);
    expect((await barById(page, candidate!.id)).depart).toBe(before.depart);
    await page.keyboard.press("Escape");
    await expect(live).toContainText("Déplacement annulé");
    await expect(page.locator("[data-gesture]")).not.toHaveAttribute("data-keyboard");
    expect((await barById(page, candidate!.id)).depart).toBe(before.depart);
    expect((await barById(page, candidate!.id)).crew).toBe(before.crew);
  });

  await test.step("un créneau refusé est annoncé et n'est pas écrit", async () => {
    const allonge = (await bars(page)).find(
      (item) => item.posture === "allonge" && item.vehicle === "ambulance" && item.depart >= 8 * 60,
    );
    expect(allonge, "aucune course allongée").toBeTruthy();
    await pressGrab(page, allonge!.id, "Enter");
    const before = await barById(page, allonge!.id);
    let reason = "";
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
      const text = (await live.textContent()) ?? "";
      if (text.includes("Pas d'autre équipage")) break;
      const ghost = await aimOf(page);
      if (ghost.preview === "invalid" && ghost.reason && /Incompatibilité|Conflit/.test(ghost.reason)) {
        expect(text).toContain(ghost.reason);
        reason = ghost.reason;
        break;
      }
    }
    expect(reason, "aucun refus au clavier").not.toBe("");
    await page.keyboard.press("Enter");
    await expect(live).toContainText("Refus.");
    await expect(live).toContainText(reason);
    await expect(page.locator(".toast-dock")).toContainText(reason);
    expect((await barById(page, allonge!.id)).depart).toBe(before.depart);
    expect((await barById(page, allonge!.id)).crew).toBe(before.crew);
    await expect(page.locator(`[data-transport-id="${allonge!.id}"]`)).not.toHaveAttribute("aria-pressed", "true");
  });
});

async function pressGrab(page: Page, id: string, key: "Enter" | "Space") {
  const block = page.locator(`[data-transport-id="${id}"]`);
  await center(page, id);
  await block.focus();
  await page.keyboard.press(key);
  await expect(page.locator("[data-live='keyboard']")).toContainText("Course saisie");
  await expect(block).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-keyboard", "1");
}

async function aimOf(page: Page) {
  const ghost = page.locator("[data-ghost]");
  await expect(ghost).toHaveCount(1);
  return {
    aim: Number(await ghost.getAttribute("data-aim")),
    depart: Number(await ghost.getAttribute("data-depart")),
    preview: await ghost.getAttribute("data-preview"),
    crew: await ghost.getAttribute("data-crew"),
    reason: await ghost.getAttribute("data-reason"),
  };
}

async function crewRows(page: Page) {
  return page.locator("[data-track]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-crew-id") ?? "",
      code: node.previousElementSibling?.querySelector("span.font-semibold")?.textContent ?? "",
      vehicle: node.getAttribute("data-vehicle") ?? "",
    })),
  );
}

function clock(min: number) {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
