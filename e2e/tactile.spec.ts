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
    const css = await page.evaluate(() => {
      const found: string[] = [];
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(".gantt-block")) found.push(rule.cssText);
        }
      }
      return found.join("\n");
    });
    expect(css).toContain("-webkit-touch-callout");
    expect(css).toContain("-webkit-user-select");
    expect(css).toMatch(/user-select:\s*none/);
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
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Dézoomer" }).click();
    await page.getByRole("button", { name: "Fermer" }).first().click();
    const narrow = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll<HTMLElement>(".gantt-block")];
      for (const node of blocks) {
        const box = node.getBoundingClientRect();
        if (box.width >= 42 || box.width < 8 || box.bottom < 80 || box.top > window.innerHeight - 40) continue;
        const x = box.x + box.width / 2 + 20;
        const y = box.y + box.height / 2;
        const hitTarget = document.elementFromPoint(x, y);
        return { width: box.width, hit: hitTarget === node || (hitTarget instanceof Node && node.contains(hitTarget)) };
      }
      return null;
    });
    expect(narrow, "un bloc plus étroit que 44 px").toBeTruthy();
    expect(narrow!.hit).toBe(true);
    await page.getByRole("button", { name: "Rechercher" }).click();
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Zoomer" }).click();
    await page.getByRole("button", { name: "Fermer" }).first().click();
  });

  const sample = (await bars(page))[0]!;
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
    await touch(page, "pointerdown", from.x, from.y, 9);
    await touch(page, "pointermove", from.x + 14, from.y, 9);
    await page.waitForTimeout(480);
    await expect(page.locator("[data-gesture]")).toHaveAttribute("data-gesture", "drag");
    await touch(page, "pointerup", from.x + 14, from.y, 9);
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    await page.locator("[data-dpad]").getByRole("button", { name: "Fermer la croix" }).click();
    await expect(page.locator("[data-dpad]")).toHaveCount(0);

    await touch(page, "pointerdown", from.x, from.y, 10);
    await touch(page, "pointermove", from.x + 6, from.y, 10);
    await page.waitForTimeout(80);
    await touch(page, "pointerup", from.x + 6, from.y, 10);
    await expect(page.locator("[data-dpad]")).toBeVisible();
    expect((await barById(page, from.id)).depart).toBe(from.depart);
    await expect(page.locator(".dpad-times")).toContainText(/Prise en charge \d{2}:\d{2} · prévue \d{2}:\d{2}/);
  });

  await test.step("l'appui long suit le doigt et n'écrit qu'au relâchement", async () => {
    const candidates = (await bars(page)).filter((item) => item.posture === "assis" && item.vehicle === "ambulance");
    let moved = false;
    for (const candidate of candidates.slice(0, 6)) {
      await center(page, candidate.id);
      const from = await barById(page, candidate.id);
      await touch(page, "pointerdown", from.x, from.y, 11);
      await page.waitForTimeout(480);
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
    const allonge = (await bars(page)).find((item) => item.posture === "allonge");
    const vsl = (await bars(page)).find((item) => item.vehicle === "vsl");
    expect(allonge && vsl).toBeTruthy();
    await center(page, allonge!.id);
    const from = await barById(page, allonge!.id);
    const box = await page.locator(`[data-crew-id="${vsl!.crew}"]`).boundingBox();
    expect(box).toBeTruthy();
    await touch(page, "pointerdown", from.x, from.y, 12);
    await page.waitForTimeout(480);
    await touch(page, "pointermove", from.x, box!.y + box!.height / 2, 12);
    await touch(page, "pointerup", from.x, box!.y + box!.height / 2, 12);
    await expect(page.getByText(/Incompatibilité|Conflit horaire/)).toBeVisible();
    expect((await barById(page, from.id)).depart).toBe(from.depart);
  });

  await test.step("la croix décale de 5 minutes, refuse, et groupe le maintien", async () => {
    await page.screenshot({ path: "/opt/cursor/artifacts/v070-dpad-phone.png" });
    const seated = (await bars(page)).filter((item) => item.posture === "assis" && item.vehicle === "ambulance");
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
    const boundary = tracks.findIndex((track, index) => track.vehicle === "ambulance" && tracks[index + 1]?.vehicle === "vsl");
    const allonge = (await bars(page)).find((item) => item.posture === "allonge");
    expect(boundary).toBeGreaterThanOrEqual(0);
    expect(allonge).toBeTruthy();
    await center(page, allonge!.id);
    await page.locator(`[data-transport-id="${allonge!.id}"]`).click();
    const toward = tracks.findIndex((track) => track.id === allonge!.crew) < boundary ? "Véhicule suivant" : "Véhicule précédent";
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

    const sameCrew = (await bars(page)).filter((item) => item.crew === beforeVsl.crew).sort((a, b) => a.depart - b.depart);
    const later = sameCrew.find((item) => sameCrew.some((other) => other.id !== item.id && other.depart < item.depart));
    if (later) {
      await center(page, later.id);
      await page.locator(`[data-transport-id="${later.id}"]`).click();
      let previous = await barById(page, later.id);
      let blocked = false;
      for (let step = 0; step < 16; step++) {
        await page.getByRole("button", { name: "5 minutes plus tôt" }).click();
        const now = await barById(page, later.id);
        const reason = (await page.locator(".dpad-reason").textContent()) ?? "";
        if (/Conflit horaire|Incompatibilité/.test(reason)) {
          expect(now.depart).toBe(previous.depart);
          blocked = true;
          break;
        }
        expect(now.depart % 5).toBe(0);
        previous = now;
      }
      expect(blocked).toBe(true);
    }

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
  let moved = false;
  for (const candidate of candidates.slice(0, 6)) {
    await center(page, candidate.id);
    await page.locator(`[data-transport-id="${candidate.id}"]`).click();
    const before = await barById(page, candidate.id);
    await page.keyboard.press("ArrowRight");
    const after = await barById(page, candidate.id);
    if ((await page.locator(".dpad-reason").count()) > 0) {
      expect(after.depart).toBe(before.depart);
      continue;
    }
    expect(after.depart % 5).toBe(0);
    expect(after.crew).toBe(before.crew);
    expect(after.depart).not.toBe(before.depart);
    await page.keyboard.press("ArrowLeft");
    const back = await barById(page, candidate.id);
    expect(Math.abs(back.depart - before.depart)).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Annuler" }).click();
    await page.getByRole("button", { name: "Annuler" }).click();
    moved = true;
    break;
  }
  expect(moved).toBe(true);

  await page.mouse.move(200, 200);
  const from = await barById(page, candidates[0]!.id);
  await center(page, from.id);
  const origin = await barById(page, from.id);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + 160, origin.y, { steps: 8 });
  await page.mouse.up();
  const dragged = await barById(page, origin.id);
  if (dragged.depart !== origin.depart) expect(dragged.depart % 5).toBe(0);
});

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
}

type Bar = { id: string; crew: string; vehicle: string; posture: string; depart: number; x: number; y: number };

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
  await page.locator(`[data-transport-id="${id}"]`).evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
}

async function frame(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function touch(page: Page, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x: number, y: number, pointerId = 7) {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
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
          buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        }),
      );
    },
    { type, x, y, pointerId },
  );
}
