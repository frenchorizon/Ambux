import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  announceAccept,
  announceAim,
  announceCancel,
  announceDrop,
  announceEdge,
  announceGrab,
  announceNoCrew,
  announceRefuse,
  blockAriaLabel,
  CONFLICT_MESSAGE,
  dragRelease,
  dragReturnsHome,
  keyboardDrag,
  KEYBOARD_POINTER,
  nextKeyboardAim,
} from "../src/components/planning/drag.ts";
import { DAY_END, DAY_START } from "../src/game/types.ts";

const crews = [{ id: "ambulance-1" }, { id: "ambulance-2" }, { id: "vsl-1" }];

describe("déplacement clavier du Gantt", () => {
  it("avance de 5 minutes, de 15 avec Maj, et change d'équipage", () => {
    const here = { crewId: "ambulance-1", departMin: 8 * 60 + 10 };
    assert.deepEqual(nextKeyboardAim(crews, here, "right", false), {
      crewId: "ambulance-1",
      departMin: 8 * 60 + 15,
    });
    assert.deepEqual(nextKeyboardAim(crews, here, "left", false), {
      crewId: "ambulance-1",
      departMin: 8 * 60 + 5,
    });
    assert.deepEqual(nextKeyboardAim(crews, here, "right", true), {
      crewId: "ambulance-1",
      departMin: 8 * 60 + 25,
    });
    assert.deepEqual(nextKeyboardAim(crews, here, "left", true), {
      crewId: "ambulance-1",
      departMin: 7 * 60 + 55,
    });
    assert.deepEqual(nextKeyboardAim(crews, here, "down", false), {
      crewId: "ambulance-2",
      departMin: 8 * 60 + 10,
    });
    assert.deepEqual(nextKeyboardAim(crews, { crewId: "ambulance-2", departMin: 8 * 60 }, "up", true), {
      crewId: "ambulance-1",
      departMin: 8 * 60,
    });
    assert.equal(nextKeyboardAim(crews, here, "up", false), "no-crew");
    assert.equal(nextKeyboardAim(crews, { crewId: "vsl-1", departMin: 9 * 60 }, "down", false), "no-crew");
    assert.equal(nextKeyboardAim(crews, { crewId: "inconnu", departMin: 9 * 60 }, "down", false), "no-crew");
  });

  it("reste dans la journée", () => {
    assert.equal(nextKeyboardAim(crews, { crewId: "ambulance-1", departMin: DAY_START }, "left", false), "edge");
    assert.deepEqual(nextKeyboardAim(crews, { crewId: "ambulance-1", departMin: DAY_START + 10 }, "left", true), {
      crewId: "ambulance-1",
      departMin: DAY_START,
    });
    assert.equal(nextKeyboardAim(crews, { crewId: "ambulance-1", departMin: DAY_END }, "right", false), "edge");
    assert.deepEqual(nextKeyboardAim(crews, { crewId: "ambulance-1", departMin: DAY_END - 10 }, "right", true), {
      crewId: "ambulance-1",
      departMin: DAY_END,
    });
  });

  it("annonce en français la saisie, la visée, la pose, le refus et l'annulation", () => {
    assert.equal(blockAriaLabel("MARTIN Camille", "08:15", "AMB-1"), "MARTIN Camille, 08:15, AMB-1");
    assert.equal(announceGrab("MARTIN Camille", "08:15", "AMB-1"), "Course saisie. MARTIN Camille, 08:15, AMB-1.");
    assert.equal(announceAim("08:20", "AMB-1"), "08:20, AMB-1.");
    assert.equal(
      announceAim("08:20", "VSL-1", "Incompatibilité : transport allongé, un VSL n'est pas habilité."),
      "08:20, VSL-1. Incompatibilité : transport allongé, un VSL n'est pas habilité.",
    );
    assert.equal(announceAccept("08:30", "AMB-2"), "Course posée. 08:30, AMB-2.");
    assert.equal(announceRefuse(CONFLICT_MESSAGE), `Refus. ${CONFLICT_MESSAGE}`);
    assert.equal(announceCancel(), "Déplacement annulé.");
    assert.equal(announceNoCrew(), "Pas d'autre équipage.");
    assert.equal(announceEdge("left"), "Pas plus tôt.");
    assert.equal(announceEdge("right"), "Pas plus tard.");
    assert.equal(announceDrop("assign", "08:30", "AMB-2", CONFLICT_MESSAGE), "Course posée. 08:30, AMB-2.");
    assert.equal(announceDrop("same", "08:15", "AMB-1", CONFLICT_MESSAGE), "Course posée. 08:15, AMB-1.");
    assert.equal(announceDrop("refuse", "08:20", "VSL-1", "Incompatibilité VSL."), "Refus. Incompatibilité VSL.");
    assert.equal(announceDrop("conflict", "08:20", "AMB-1", CONFLICT_MESSAGE), `Refus. ${CONFLICT_MESSAGE}`);
    assert.equal(announceDrop("cancel", "08:20", "AMB-1", CONFLICT_MESSAGE), "Déplacement annulé.");
  });

  it("passe par la même décision que le relâchement du glisser", () => {
    const placed = keyboardDrag("t1", "ambulance-2", 8 * 60 + 20, {
      ok: true,
      departMin: 8 * 60 + 20,
      leg: {} as never,
    });
    assert.equal(placed.pointerId, KEYBOARD_POINTER);
    assert.equal(placed.moved, true);
    assert.equal(dragRelease(placed, false), "assign");
    assert.equal(dragRelease(placed, true), "same");
    assert.equal(dragReturnsHome(placed, "assign"), false);
    const refused = keyboardDrag("t1", "vsl-1", 8 * 60, {
      ok: false,
      reason: "incompatible",
      message: "Incompatibilité : transport allongé, un VSL n'est pas habilité.",
    });
    assert.equal(dragRelease(refused, false), "refuse");
    assert.equal(dragReturnsHome(refused, "refuse"), false);
  });
});
