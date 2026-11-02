import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("gestes émulés et croix directionnelle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "émulation 390×844, pas un iPhone");
  test.setTimeout(180_000);
  await openPlanning(page);

  await test.step("le planning défile encore, sans second geste", async () => {
    const scroll = await page.locator(".gantt-scroll").evaluate((node) => {
      const style = getComputedStyle(node);
      return { x: style.overflowX, y: style.overflowY, touch: style.touchAction };
    });
    expect(scroll.x).toBe("auto");
    expect(scroll.y).toBe("auto");
    expect(scroll.touch).not.toBe("none");
    await expect(page.locator("[data-unassigned]")).toHaveCount(0);
    const body = await page.evaluate(() => getComputedStyle(document.body).userSelect);
    expect(body).not.toBe("none");
  });

  await test.step("le bloc refuse la loupe et la sélection, la cible fait 44 px", async () => {
    const css = await page.evaluate(async () => {
      const served = await (await fetch("/src/index.css")).text();
      const computed = getComputedStyle(document.querySelector(".gantt-block")!).userSelect;
      return { served, computed };
    });
    expect(css.served).toContain("-webkit-touch-callout: none");
    expect(css.served).toContain("-webkit-user-select: none");
    expect(css.served).toMatch(/user-select:\s*none/);
    expect(css.computed).toBe("none");
    const block = page.locator(".gantt-block").first();
    const select = await block.evaluate((node) => getComputedStyle(node).userSelect);
    expect(select).toBe("none");
    const hit = await block.evaluate((node) => {
      const before = getComputedStyle(node, "::before");
      return { width: parseFloat(before.width), height: parseFloat(before.height) };
    });
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.height).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Rechercher" }).click();
    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Dézoomer", exact: true }).click();
    await closeFind(page);
    const narrow = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll<HTMLElement>(".gantt-block")];
      for (const node of blocks) {
        const box = node.getBoundingClientRect();
        if (box.width >= 36 || box.width < 8 || box.bottom < 120 || box.top > window.innerHeight - 80) continue;
        const x = box.right + 3;
        const y = box.y + box.height / 2;
        const hitTarget = document.elementFromPoint(x, y);
        const owner = hitTarget instanceof Element ? hitTarget.closest(".gantt-block") : null;
        if (owner) {
          return { width: Math.round(box.width), outside: true, hit: true };
        }
      }
      return null;
    });
    expect(narrow).toMatchObject({ hit: true, outside: true });
    await page.getByRole("button", { name: "Rechercher" }).click();
    for (let i = 0; i < 10; i++) {
      const zoom = await page.locator("span.tabular-nums").innerText();
      if (Number.parseInt(zoom, 10) >= 320) break;
      await page.getByRole("button", { name: "Zoomer", exact: true }).click();
    }
    await closeFind(page);
  });

  const sample = (await bars(page)).find((item) => item.depart >= 8 * 60) ?? (await bars(page))[0]!;
  await center(page, sample.id);

  await test.step("pointercancel n'affecte ni la sélection ni l'heure", async () => {
    const from = await barById(page, sample.id);
    await touch(page, "pointerdown", from.x, from.y);
    await page.waitForTimeout(480);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
    await touch(page, "pointermove", from.x + 70, from.y);
    await frame(page);
    await touch(page, "pointercancel", from.x + 70, from.y);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    await expect(page.locator("[data-dpad]")).toHaveCount(0);
  });

  await test.step("un pan vertical ou un écart franc défile, sans déplacement", async () => {
    const from = await barById(page, sample.id);
    await touch(page, "pointerdown", from.x, from.y);
    await touch(page, "pointermove", from.x, from.y + 48);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "scroll");
    await touch(page, "pointerup", from.x, from.y + 48);
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    await expect(page.locator("[data-dpad]")).toHaveCount(0);

    await touch(page, "pointerdown", from.x, from.y, 8);
    await touch(page, "pointermove", from.x + 36, from.y, 8);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "scroll");
    await touch(page, "pointerup", from.x + 36, from.y, 8);
    expect((await barById(page, from.id)).depart).toBe(from.depart);
  });

  await test.step("un petit écart ne tue plus l'appui long, un relâchement tôt sélectionne", async () => {
    const from = await barById(page, sample.id);
    await touch(page, "pointerdown", from.x, from.y, 10);
    await touch(page, "pointermove", from.x + 6, from.y, 10);
    await page.waitForTimeout(80);
    await touch(page, "pointerup", from.x + 6, from.y, 10);
    await expect(page.locator("[data-dpad]")).toBeVisible();
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    await expect(page.locator(".dpad-times")).toContainText(/Prise en charge \d{2}:\d{2} · prévue \d{2}:\d{2}/);

    await touch(page, "pointerdown", from.x, from.y, 9);
    await touch(page, "pointermove", from.x + 14, from.y, 9);
    await page.waitForTimeout(480);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
    await touch(page, "pointerup", from.x + 14, from.y, 9);
    expect((await barById(page, from.id)).depart).toBe(from.depart);
  });

  await test.step("l'appui long suit le doigt et n'écrit qu'au relâchement", async () => {
    const candidates = (await bars(page)).filter(
      (item) => item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 8 * 60,
    );
    let moved = false;
    for (const candidate of candidates.slice(0, 6)) {
      await center(page, candidate.id);
      const from = await barById(page, candidate.id);
      await touch(page, "pointerdown", from.x, from.y, 11);
      await expect(page.locator(`[data-transport-id="${from.id}"]`)).toHaveClass(/gantt-pending/);
      await page.waitForTimeout(480);
      const armed = await page.locator(`[data-transport-id="${from.id}"]`).evaluate((node) => ({
        armed: node.getAttribute("data-armed"),
        pending: node.classList.contains("gantt-pending"),
        transform: (node as HTMLElement).style.transform,
        opacity: getComputedStyle(node).opacity,
        will: getComputedStyle(node).willChange,
        touch: getComputedStyle(node).touchAction,
      }));
      expect(armed.armed).toBe("1");
      expect(armed.pending).toBe(false);
      expect(armed.transform).not.toContain("scale");
      expect(armed.opacity).toBe("0.6");
      expect(armed.will).toContain("transform");
      expect(armed.touch).toBe("none");
      await touch(page, "pointermove", from.x + 30, from.y, 11);
      await frame(page);
      const mid = await page.locator(`[data-transport-id="${from.id}"]`).evaluate((node) => ({
        transform: (node as HTMLElement).style.transform,
        depart: node.getAttribute("data-depart"),
      }));
      expect(mid.transform).toContain("translate");
      expect(Number(mid.depart)).toBe(from.depart);
      await touch(page, "pointermove", from.x + 150, from.y, 11);
      await touch(page, "pointerup", from.x + 150, from.y, 11);
      const after = await barById(page, from.id);
      if (after.depart !== from.depart && after.crew === from.crew) {
        expect(after.depart % 5).toBe(0);
        await page.getByRole("button", { name: "Annuler" }).click();
        expect((await barById(page, from.id)).depart).toBe(from.depart);
        await page.getByRole("button", { name: "Rétablir" }).click();
        expect((await barById(page, from.id)).depart).toBe(after.depart);
        await page.getByRole("button", { name: "Annuler" }).click();
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  await test.step("déposer un allongé sur un VSL est refusé", async () => {
    const allonge = (await bars(page)).find((item) => item.posture === "allonge" && item.depart >= 8 * 60);
    const vsl = (await bars(page)).find((item) => item.vehicle === "vsl");
    expect(allonge && vsl).toBeTruthy();
    await center(page, allonge!.id);
    const from = await barById(page, allonge!.id);
    const box = await page.locator(`[data-crew-id="${vsl!.crew}"]`).boundingBox();
    expect(box).toBeTruthy();
    await touch(page, "pointerdown", from.x, from.y, 12);
    await page.waitForTimeout(480);
    await touch(page, "pointermove", from.x, box!.y + box!.height / 2, 12);
    await frame(page);
    const refused = page.locator("[data-ghost][data-preview='invalid']");
    await expect(refused).toBeVisible();
    await expect(refused).toHaveAttribute("data-reason", /Incompatibilité :|Conflit horaire :/);
    await expect(refused).toContainText(/VSL|DEA|Conflit/);
    await page.screenshot({ path: "/opt/cursor/artifacts/v080-gantt-phone.png" });
    await touch(page, "pointerup", from.x, box!.y + box!.height / 2, 12);
    await expect(page.getByText(/Incompatibilité|Conflit horaire/)).toBeVisible();
    await expect(page.locator(".dpad-reason")).toHaveCount(0);
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    expect((await barById(page, from.id)).crew).toBe(from.crew);
  });

  await test.step("la croix décale de 5 minutes, refuse, et groupe le maintien", async () => {
    await page.screenshot({ path: "/opt/cursor/artifacts/v070-dpad-phone.png" });
    const seated = (await bars(page)).filter(
      (item) => item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 8 * 60,
    );
    let separate = false;
    for (const candidate of seated.slice(0, 6)) {
      await center(page, candidate.id);
      await page.locator(`[data-transport-id="${candidate.id}"]`).click();
      const before = await barById(page, candidate.id);
      await page.getByRole("button", { name: "5 minutes plus tard" }).click();
      const once = await barById(page, candidate.id);
      const rejected = await page.locator(".dpad-reason").count();
      if (rejected) {
        expect(once.depart).toBe(before.depart);
        continue;
      }
      expect(once.depart % 5).toBe(0);
      expect(once.crew).toBe(before.crew);
      await page.getByRole("button", { name: "5 minutes plus tard" }).click();
      const twice = await barById(page, candidate.id);
      if (twice.depart === once.depart) {
        await page.getByRole("button", { name: "Annuler" }).click();
        continue;
      }
      expect(twice.depart % 5).toBe(0);
      await page.getByRole("button", { name: "Annuler" }).click();
      expect((await barById(page, candidate.id)).depart).toBe(once.depart);
      await page.getByRole("button", { name: "Annuler" }).click();
      expect((await barById(page, candidate.id)).depart).toBe(before.depart);
      const handle = page.getByRole("button", { name: "5 minutes plus tard" });
      const box = await handle.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(720);
      await page.mouse.up();
      const held = await barById(page, candidate.id);
      if (held.depart - before.depart >= 10) {
        await page.getByRole("button", { name: "Annuler" }).click();
        expect((await barById(page, candidate.id)).depart).toBe(before.depart);
        separate = true;
        break;
      }
      if (held.depart !== before.depart) await page.getByRole("button", { name: "Annuler" }).click();
    }
    expect(separate).toBe(true);

    const tracks = await page.locator("[data-track]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute("data-crew-id") ?? "",
        vehicle: node.getAttribute("data-vehicle") ?? "",
      })),
    );
    const boundary = tracks.findIndex(
      (track, index) => track.vehicle === "ambulance" && tracks[index + 1]?.vehicle === "vsl",
    );
    const allonge = (await bars(page)).find((item) => item.posture === "allonge");
    expect(boundary).toBeGreaterThanOrEqual(0);
    expect(allonge).toBeTruthy();
    await center(page, allonge!.id);
    await page.locator(`[data-transport-id="${allonge!.id}"]`).click();
    const toward =
      tracks.findIndex((track) => track.id === allonge!.crew) < boundary ? "Véhicule suivant" : "Véhicule précédent";
    for (let step = 0; step < 6; step++) {
      const now = await barById(page, allonge!.id);
      if (tracks.findIndex((track) => track.id === now.crew) === boundary) break;
      const crewBefore = now.crew;
      await page.getByRole("button", { name: toward }).click();
      const next = await barById(page, allonge!.id);
      if (next.crew === crewBefore) break;
    }
    const beforeVsl = await barById(page, allonge!.id);
    await page.getByRole("button", { name: toward }).click();
    const afterVsl = await barById(page, allonge!.id);
    await expect(page.locator(".dpad-reason")).toContainText(/Incompatibilité|Conflit horaire|Pas d'autre équipage/);
    expect(afterVsl.crew).toBe(beforeVsl.crew);
    expect(tracks.find((track) => track.id === afterVsl.crew)?.vehicle).not.toBe("vsl");

    const crowded = await bars(page);
    const pair = crowded.find(
      (item) => item.depart >= 8 * 60 && crowded.some((other) => other.crew === item.crew && other.id !== item.id),
    );
    expect(pair).toBeTruthy();
    const neighbor = crowded.find((item) => item.crew === pair!.crew && item.id !== pair!.id)!;
    await center(page, pair!.id);
    const from = await barById(page, pair!.id);
    const onto = await barById(page, neighbor.id);
    await touch(page, "pointerdown", from.x, from.y, 13);
    await page.waitForTimeout(480);
    await touch(page, "pointermove", onto.x, onto.y, 13);
    await touch(page, "pointerup", onto.x, onto.y, 13);
    const dropped = await barById(page, pair!.id);
    const after = await bars(page);
    const overlaps = after.some(
      (item) =>
        item.id !== dropped.id &&
        item.crew === dropped.crew &&
        dropped.depart < item.end - 1 &&
        dropped.end > item.depart + 1,
    );
    expect(overlaps).toBe(false);
    if (dropped.depart !== from.depart) expect(dropped.depart % 5).toBe(0);

    const pad = await page.locator("[data-dpad]").boundingBox();
    const grip = await page.getByRole("button", { name: "Déplacer la croix" }).boundingBox();
    expect(pad && grip).toBeTruthy();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x - 80, grip!.y - 80, { steps: 6 });
    await page.mouse.up();
    const movedPad = await page.locator("[data-dpad]").boundingBox();
    expect(Math.abs(movedPad!.x - pad!.x)).toBeGreaterThan(20);
    await page.getByRole("button", { name: "Fermer la croix" }).click();
    await expect(page.locator("[data-dpad]")).toHaveCount(0);
    await page.locator(`[data-transport-id="${sample.id}"]`).click();
    await expect(page.locator("[data-dpad]")).toBeVisible();
  });

  await test.step("reposer au même créneau n'ajoute pas d'annulation", async () => {
    const candidates = (await bars(page)).filter(
      (item) => item.posture === "assis" && item.vehicle === "ambulance" && item.depart >= 8 * 60,
    );
    let proved = false;
    for (const candidate of candidates.slice(0, 6)) {
      await center(page, candidate.id);
      await page.locator(`[data-transport-id="${candidate.id}"]`).click();
      const before = await barById(page, candidate.id);
      await page.getByRole("button", { name: "5 minutes plus tard" }).click();
      if ((await page.locator(".dpad-reason").count()) > 0) continue;
      const shifted = await barById(page, candidate.id);
      if (shifted.depart === before.depart) continue;
      const blocks = await page.locator(".gantt-block").count();
      await center(page, candidate.id);
      const point = await page.locator(`[data-transport-id="${candidate.id}"]`).evaluate((node) => {
        const box = node.getBoundingClientRect();
        const depart = Number(node.getAttribute("data-depart"));
        const end = Number(node.getAttribute("data-end"));
        const px = box.width / Math.max(1, end - depart);
        const snapped = Math.round(depart / 5) * 5;
        const raw = box.x + (snapped - depart) * px + 2;
        const left = Math.max(box.left + 2, 110);
        const right = Math.min(box.right - 2, window.innerWidth - 8);
        const y = box.y + box.height / 2;
        if (right - left < 4 || y < 90 || y > window.innerHeight - 90) return null;
        const x = Math.min(right, Math.max(left, raw));
        const hit = document.elementFromPoint(x, y);
        if (!(hit instanceof Element) || hit.closest(".gantt-block") !== node) return null;
        return { x, y };
      });
      if (!point) {
        await page.getByRole("button", { name: "Annuler" }).click();
        continue;
      }
      await touch(page, "pointerdown", point.x, point.y, 21);
      await page.waitForTimeout(480);
      await touch(page, "pointermove", point.x, point.y + 14, 21);
      await frame(page);
      await touch(page, "pointerup", point.x, point.y + 14, 21);
      const dropped = await barById(page, candidate.id);
      if (dropped.depart !== shifted.depart || dropped.crew !== shifted.crew) {
        await page.getByRole("button", { name: "Annuler" }).click();
        await page.getByRole("button", { name: "Annuler" }).click();
        continue;
      }
      await page.getByRole("button", { name: "Annuler" }).click();
      const undone = await barById(page, candidate.id);
      expect(undone.depart).toBe(before.depart);
      expect(await page.locator(".gantt-block").count()).toBe(blocks);
      proved = true;
      break;
    }
    expect(proved).toBe(true);
  });

  await test.step("la carte et À placer n'ouvrent pas un second glisser", async () => {
    await page.getByRole("button", { name: "Carte" }).click();
    await expect(page.locator(".gantt-block")).toHaveCount(0);
    await page.getByRole("button", { name: "À placer" }).click();
    await expect(page.locator(".gantt-block")).toHaveCount(0);
    await expect(page.locator("[data-unassigned]")).toBeVisible();
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.locator(".gantt-scroll")).toBeVisible();
  });
});

test("les flèches du clavier décalent la course", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "clavier bureau");
  test.setTimeout(120_000);
  await openPlanning(page);
  const candidates = (await bars(page)).filter((item) => item.posture === "assis");
  let movedId = "";
  for (const candidate of candidates.slice(0, 6)) {
    await center(page, candidate.id);
    await page.locator(`[data-transport-id="${candidate.id}"]`).click();
    const before = await barById(page, candidate.id);
    await page.keyboard.press("ArrowRight");
    const after = await barById(page, candidate.id);
    if ((await page.locator(".dpad-reason").count()) > 0 || after.depart === before.depart) {
      expect(after.depart).toBe(before.depart);
      continue;
    }
    expect(after.depart % 5).toBe(0);
    expect(after.crew).toBe(before.crew);
    expect(after.depart).not.toBe(before.depart);
    await page.keyboard.press("ArrowLeft");
    const back = await barById(page, candidate.id);
    if ((await page.locator(".dpad-reason").count()) > 0) {
      expect(back.depart).toBe(after.depart);
    } else {
      expect(back.depart % 5).toBe(0);
      expect(Math.abs(back.depart - before.depart)).toBeLessThanOrEqual(2);
      await page.getByRole("button", { name: "Annuler" }).click();
    }
    await page.getByRole("button", { name: "Annuler" }).click();
    expect((await barById(page, candidate.id)).depart).toBe(before.depart);
    movedId = candidate.id;
    break;
  }
  expect(movedId).not.toBe("");

  const origin = await barById(page, movedId);
  await center(page, origin.id);
  const from = await barById(page, origin.id);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 36, from.y, { steps: 4 });
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "idle");
  expect((await barById(page, from.id)).depart).toBe(from.depart);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 160, from.y, { steps: 8 });
  await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
  await page.screenshot({ path: "/opt/cursor/artifacts/dnd1_drag_1440.png", scale: "css" });
  await page.mouse.up();
  const dragged = await barById(page, from.id);
  if (dragged.depart !== from.depart) expect(dragged.depart % 5).toBe(0);
});

async function closeFind(page: Page) {
  await page
    .getByRole("dialog", { name: "Chercher et afficher" })
    .locator("h2")
    .locator("..")
    .getByRole("button", { name: "Fermer" })
    .click();
}

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
}

type Bar = {
  id: string;
  crew: string;
  vehicle: string;
  posture: string;
  depart: number;
  end: number;
  x: number;
  y: number;
};

async function bars(page: Page): Promise<Bar[]> {
  return page.locator("[data-transport-id]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const track = node.closest("[data-track]");
      const box = node.getBoundingClientRect();
      return {
        id: node.getAttribute("data-transport-id") ?? "",
        crew: track?.getAttribute("data-crew-id") ?? "",
        vehicle: track?.getAttribute("data-vehicle") ?? "",
        posture: node.getAttribute("data-posture") ?? "",
        depart: Number(node.getAttribute("data-depart")),
        end: Number(node.getAttribute("data-end")),
        x: box.x + Math.min(box.width / 2, 24),
        y: box.y + box.height / 2,
      };
    }),
  );
}

async function barById(page: Page, id: string): Promise<Bar> {
  const found = (await bars(page)).find((item) => item.id === id);
  expect(found, id).toBeTruthy();
  return found!;
}

async function center(page: Page, id: string) {
  await page
    .locator(`[data-transport-id="${id}"]`)
    .evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
}

async function frame(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function touch(
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
  pointerId = 7,
) {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
      const target = type === "pointerdown" ? document.elementFromPoint(x, y) : window;
      if (!target) throw new Error(`pas de cible ${type}`);
      if (type === "pointerdown" && target instanceof Element && !target.closest(".gantt-block")) {
        const name = target instanceof HTMLElement ? `${target.tagName}.${target.className}` : target.tagName;
        throw new Error(`pointerdown hors bloc: ${name} @ ${x},${y}`);
      }
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerType: "touch",
          pointerId,
          isPrimary: true,
          buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        }),
      );
    },
    { type, x, y, pointerId },
  );
}
