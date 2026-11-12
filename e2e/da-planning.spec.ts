import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { openPlanning } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("l'en-tête, le menu et la carte de détail suivent la maquette", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const header = page.getByRole("banner");
  await expect(header.getByText("Demain est posé.", { exact: true })).toBeVisible();
  const meta = header.locator("[data-plan-meta]");
  const courses = Number(await meta.getAttribute("data-courses"));
  const blocks = await page.locator("[data-transport-id]").count();
  expect(courses).toBe(blocks);
  await expect(meta).toContainText(`${courses} courses`);
  const saved = await meta.getAttribute("data-saved");
  expect(saved).toMatch(/^-?\d+$/);
  await expect(meta).toContainText("km");

  await header.getByRole("button", { name: "Autres actions" }).click();
  const menu = page.getByRole("group", { name: "Autres actions" });
  for (const name of ["Importer", "Feuilles de route", "Exporter", "Aide"]) {
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Annuler", "Rétablir", "Rechercher"]) {
    await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await header.getByRole("button", { name: "Autres actions" }).click();

  await expect(page.getByRole("navigation", { name: "Navigation" }).getByRole("button")).toHaveCount(5);

  await expect(page.locator(".gantt-block").getByText(/[−-]\d+ min/)).toHaveCount(0);
  const overflow = await page.locator(".gantt-block").evaluateAll(
    (blocks) =>
      blocks.filter((block) => {
        const names = [...block.querySelectorAll(".gantt-name")];
        if (names.length > 1) return true;
        const label = names[0];
        if (!label)
          return [...block.querySelectorAll("span")].some(
            (node) => (node.textContent ?? "").trim().length > 0 && !node.classList.contains("gantt-dot"),
          );
        const box = block.getBoundingClientRect();
        const text = label.getBoundingClientRect();
        return text.right > box.right + 1 || text.left < box.left - 1 || text.bottom > box.bottom + 1;
      }).length,
  );
  expect(overflow).toBe(0);
  const ratios = await contrastSamples(page);
  console.log(`DA_CONTRAST ${JSON.stringify(ratios)}`);
  expect(ratios.blocks.length).toBeGreaterThanOrEqual(6);
  for (const sample of ratios.blocks) expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  expect(ratios.subtitle).toBeGreaterThanOrEqual(4.5);

  const block = page.locator(".gantt-block").nth(8);
  await block.click();
  const detail = page.getByRole("complementary", { name: "Détail de la course" });
  await expect(detail).toBeVisible();
  const lines = await detail.locator("[data-patient-line]").allTextContents();
  expect(lines).toHaveLength(4);
  expect(lines[0]?.trim()).not.toMatch(/·|RDV|Prise en charge|Dépose/);
  expect(lines[1]).toMatch(
    /DIAL - DIALYSE|KINE - KINE|CONS - CONSULTATION|ORTHO|RADI - RADIOTHÉRAPIE|^Aller$|^Retour$/,
  );
  expect(lines[2]).toMatch(/^Prise en charge \d{2}:\d{2}$/);
  expect(lines[3]).toMatch(/^Dépose \d{2}:\d{2}$/);
  await expect(detail.locator("[data-patient-rdv]")).toContainText(/RDV \d{2}:\d{2}/);
  const nameBox = await detail.locator("[data-patient-name]").boundingBox();
  const cardBox = await detail.boundingBox();
  expect(nameBox && cardBox).toBeTruthy();
  expect(nameBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  if (testInfo.project.name === "desktop") {
    expect(cardBox!.width).toBeGreaterThan(400);
    expect(cardBox!.width).toBeLessThan(450);
  }
  if (testInfo.project.name === "phone") expect(cardBox!.width).toBeLessThan(380);
  await expect(detail.getByRole("button", { name: "Meilleur créneau" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Retirer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);

  await block.click();
  await expect(detail).toBeVisible();
  await page.locator(".da-gantt-head").click({ position: { x: 8, y: 8 } });
  await expect(detail).toHaveCount(0);

  await page
    .getByText("Planning généré")
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => undefined);
  if (testInfo.project.name === "phone") {
    const pill = page.getByRole("navigation", { name: "Navigation" });
    const box = await pill.boundingBox();
    expect(box?.width ?? 0).toBeLessThan(390);
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-390.png", scale: "css" });
    await page
      .getByRole("button", { name: /MORIN Bernard/ })
      .first()
      .click();
    await expect(detail.locator("[data-patient-name]")).toHaveText("MORIN Bernard");
    await page.screenshot({ path: "/opt/cursor/artifacts/da-detail-390.png", scale: "css" });
    await page.screenshot({ path: "/opt/cursor/artifacts/carte-patient-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-1440.png", scale: "css" });
    await page
      .getByRole("button", { name: /MORIN Bernard/ })
      .first()
      .click();
    await expect(detail.locator("[data-patient-name]")).toHaveText("MORIN Bernard");
    await page.screenshot({ path: "/opt/cursor/artifacts/da-detail-1440.png", scale: "css" });
    await page.screenshot({ path: "/opt/cursor/artifacts/carte-patient-1440.png", scale: "css" });
    await detail.getByRole("button", { name: "Retirer" }).click();
    await expect(detail.locator("[data-pickup-times]")).toHaveText("Prise en charge —");
    await expect(detail.locator("[data-patient-dropoff]")).toHaveText("Dépose —");
    await page.screenshot({ path: "/opt/cursor/artifacts/carte-patient-non-placee-1440.png", scale: "css" });
    await page.keyboard.press("Escape");
    await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
    await page.getByRole("button", { name: "Mode clair" }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.locator(".da-gantt-scene")).toBeVisible();
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-clair-1440.png", scale: "css" });
  }
});

test("un point orange signale une anomalie réelle", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const dot = page.locator("[data-anomaly]");
  if ((await dot.count()) === 0) {
    const blocks = page.locator(".gantt-block");
    const total = await blocks.count();
    for (let index = total - 1; index >= Math.max(0, total - 8) && (await dot.count()) === 0; index -= 1) {
      await blocks.nth(index).click();
      const later = page.getByRole("button", { name: "5 minutes plus tard" });
      for (let step = 0; step < 14 && (await dot.count()) === 0; step += 1) {
        if (!(await later.isVisible())) break;
        await later.dispatchEvent("pointerdown");
      }
    }
  }
  await expect(dot.first()).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(/\d+ points à vérifier/);
  const shot = testInfo.project.name === "phone" ? "da-anomalie-390.png" : "da-anomalie-1440.png";
  if (testInfo.project.name === "phone" || testInfo.project.name === "desktop") {
    await page.screenshot({ path: `/opt/cursor/artifacts/${shot}`, scale: "css" });
  }
});

async function contrastSamples(page: import("@playwright/test").Page) {
  const blocks = page.locator(".gantt-block:has(.gantt-name)");
  const count = await blocks.count();
  const seen = new Set<string>();
  const result: { tint: string; ratio: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const block = blocks.nth(index);
    const tint = await block.evaluate((node) => getComputedStyle(node).getPropertyValue("--crew").trim());
    if (seen.has(tint)) continue;
    seen.add(tint);
    await block.scrollIntoViewIfNeeded();
    const box = await block.boundingBox();
    const view = page.viewportSize();
    if (!box || !view || box.width < 40 || box.height < 8) continue;
    const width = Math.min(28, Math.max(4, Math.floor(box.width * 0.35)));
    const height = Math.min(12, Math.max(4, Math.floor(box.height - 4)));
    const clip = {
      x: Math.min(view.width - width, Math.max(0, box.x + box.width - width - 4)),
      y: Math.min(view.height - height, Math.max(0, box.y + (box.height - height) / 2)),
      width,
      height,
    };
    if (clip.x + width > view.width || clip.y + height > view.height) continue;
    const png = await page.screenshot({ clip });
    const rgb = pngFill(png);
    const ratio = contrast(rgb, [255, 255, 255]);
    if (ratio < 2) continue;
    result.push({ tint, ratio: Number(ratio.toFixed(2)) });
  }
  const meta = page.locator("[data-plan-meta]");
  const metaBox = await meta.boundingBox();
  const ink = await meta.evaluate((node) => {
    const [red, green, blue] = getComputedStyle(node).color.match(/\d+/g) ?? ["0", "0", "0"];
    return [Number(red), Number(green), Number(blue)];
  });
  const ground = await page.screenshot({
    clip: {
      x: Math.max(0, (metaBox?.x ?? 24) - 8),
      y: Math.max(0, (metaBox?.y ?? 24) - 6),
      width: 4,
      height: 4,
    },
  });
  const subtitle = Number(contrast(pngPixel(ground), ink).toFixed(2));
  return { blocks: result, subtitle };
}

function contrast(background: number[], foreground: number[]): number {
  const lum = (channels: number[]) => {
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const high = Math.max(lum(background), lum(foreground));
  const low = Math.min(lum(background), lum(foreground));
  return (high + 0.05) / (low + 0.05);
}

function pngFill(buffer: Buffer): number[] {
  const ranked = pngPixels(buffer)
    .map((pixel) => ({
      pixel,
      lum: pixel[0]! * 0.2126 + pixel[1]! * 0.7152 + pixel[2]! * 0.0722,
    }))
    .filter((item) => item.lum > 40 && item.lum < 170)
    .sort((a, b) => a.lum - b.lum);
  return ranked[Math.floor(ranked.length / 2)]?.pixel ?? [18, 22, 28];
}

function pngPixel(buffer: Buffer): number[] {
  return pngPixels(buffer)[0] ?? [0, 0, 0];
}

function pngPixels(buffer: Buffer): number[][] {
  let offset = 8;
  let width = 0;
  let colorType = 2;
  const parts: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      colorType = data[9] ?? 2;
    } else if (type === "IDAT") parts.push(Buffer.from(data));
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const prev = new Array<number>(stride).fill(0);
  const pixels: number[][] = [];
  let cursor = 0;
  while (cursor + stride < raw.length) {
    const filter = raw[cursor] ?? 0;
    cursor += 1;
    const row = new Array<number>(stride).fill(0);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels]! : 0;
      const up = prev[index] ?? 0;
      const upLeft = index >= channels ? prev[index - channels]! : 0;
      const sample = raw[cursor + index] ?? 0;
      if (filter === 1) row[index] = (sample + left) & 255;
      else if (filter === 2) row[index] = (sample + up) & 255;
      else if (filter === 3) row[index] = (sample + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[index] = (sample + paeth(left, up, upLeft)) & 255;
      else row[index] = sample;
    }
    cursor += stride;
    for (let index = 0; index < stride; index += 1) prev[index] = row[index]!;
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      pixels.push([row[index] ?? 0, row[index + 1] ?? 0, row[index + 2] ?? 0]);
    }
  }
  return pixels;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDelta = Math.abs(estimate - left);
  const upDelta = Math.abs(estimate - up);
  const upLeftDelta = Math.abs(estimate - upLeft);
  if (leftDelta <= upDelta && leftDelta <= upLeftDelta) return left;
  if (upDelta <= upLeftDelta) return up;
  return upLeft;
}
