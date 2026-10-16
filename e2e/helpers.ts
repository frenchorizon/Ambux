import { expect, type Page } from "@playwright/test";

export async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
}

const DATA_VIEWS = new Set(["Équipages", "Véhicules", "Patients", "Demande de demain"]);

export async function openMenu(page: Page, label: string) {
  if (DATA_VIEWS.has(label)) {
    await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    return;
  }
  const shown = label === "Exporter le CSV" ? "Exporter" : label;
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("banner").getByRole("button", { name: shown, exact: true }).click();
}

export async function showTimeline(page: Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Timeline", exact: true }).click();
}

export const goTimeline = showTimeline;

export type Bar = {
  id: string;
  crew: string;
  vehicle: string;
  posture: string;
  depart: number;
  end: number;
  appointment: number;
  x: number;
  y: number;
};

export async function bars(page: Page): Promise<Bar[]> {
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
        appointment: Number(node.getAttribute("data-appointment")),
        x: box.x + Math.min(box.width / 2, 24),
        y: box.y + box.height / 2,
      };
    }),
  );
}

export async function barById(page: Page, id: string): Promise<Bar> {
  const found = (await bars(page)).find((item) => item.id === id);
  expect(found, id).toBeTruthy();
  return found!;
}

export async function center(page: Page, id: string) {
  await page
    .locator(`[data-transport-id="${id}"]`)
    .evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
}

export async function mealWindows(page: Page): Promise<{ start: number; end: number }[]> {
  return page.evaluate(() => {
    const dayStart = 6 * 60;
    let px = 0;
    for (const sample of document.querySelectorAll<HTMLElement>("[data-depart]")) {
      const depart = Number(sample.dataset.depart);
      const left = Number.parseFloat(sample.style.left);
      if (depart > dayStart + 30 && left > 8) {
        px = left / (depart - dayStart);
        break;
      }
    }
    if (px <= 0) return [];
    return [...document.querySelectorAll<HTMLElement>("[title='Pause repas obligatoire']")].map((block) => {
      const start = dayStart + Number.parseFloat(block.style.left) / px;
      const end = start + Number.parseFloat(block.style.width) / px;
      return { start, end };
    });
  });
}

export async function shiftSpans(page: Page): Promise<{ start: string; end: string }[]> {
  return page.locator("[data-track]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const title = node.previousElementSibling?.getAttribute("title") ?? "";
      const match = title.match(/(\d{2}:\d{2}).(\d{2}:\d{2})/);
      return { start: match?.[1] ?? "", end: match?.[2] ?? "" };
    }),
  );
}

export function minutes(clock: string): number {
  const [hours, mins] = clock.split(":").map(Number);
  return hours * 60 + mins;
}

export async function touch(
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
  pointerId = 21,
) {
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
