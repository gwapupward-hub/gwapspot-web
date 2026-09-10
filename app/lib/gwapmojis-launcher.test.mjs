import assert from "node:assert/strict";
import test from "node:test";
import { createGwapMojisLauncher } from "./gwapmojis-launcher.ts";

const pointer = (overrides = {}) => ({
  pointerId: 1, pointerType: "touch", isPrimary: true, button: 0,
  clientX: 30, clientY: 30, timeStamp: 100, ...overrides,
});

for (const pointerType of ["touch", "pen"]) {
  test(`${pointerType} opens on first release without waiting for click, with one open event`, () => {
    const launcher = createGwapMojisLauncher();
    let opens = 0;
    launcher.pointerDown(pointer({ pointerType }));
    if (launcher.pointerUp(pointer({ pointerType, timeStamp: 200 }))) opens++;
    assert.equal(opens, 1);
    if (launcher.click(1)) opens++;
    assert.equal(opens, 1, "the compatibility click must not emit another open event");
    launcher.close();
    launcher.pointerDown(pointer({ pointerType, timeStamp: 400 }));
    if (launcher.pointerUp(pointer({ pointerType, timeStamp: 500 }))) opens++;
    assert.equal(opens, 2, "a later deliberate tap can reopen the panel");
  });
}

test("a swipe that returns to its start does not open, even if a click follows", () => {
  const launcher = createGwapMojisLauncher();
  launcher.pointerDown(pointer());
  launcher.pointerMove(pointer({ clientY: 80 }));
  assert.equal(launcher.pointerUp(pointer({ timeStamp: 200 })), false);
  assert.equal(launcher.click(1), false);
});

test("release movement, long press, cancellation and secondary touches do not open", () => {
  for (const scenario of ["movement", "long", "cancel", "secondary", "other-pointer", "right-button"]) {
    const launcher = createGwapMojisLauncher();
    launcher.pointerDown(pointer({ isPrimary: scenario !== "secondary", button: scenario === "right-button" ? 2 : 0 }));
    if (scenario === "cancel") launcher.pointerCancel();
    assert.equal(launcher.pointerUp(pointer({
      clientX: scenario === "movement" ? 70 : 30,
      timeStamp: scenario === "long" ? 900 : 200,
      pointerId: scenario === "other-pointer" ? 2 : 1,
    })), false, scenario);
    assert.equal(launcher.click(1), false, scenario);
  }
});

test("mouse click and keyboard/assistive activation remain native and can reopen", () => {
  const launcher = createGwapMojisLauncher();
  launcher.pointerDown(pointer({ pointerType: "mouse" }));
  assert.equal(launcher.pointerUp(pointer({ pointerType: "mouse", timeStamp: 200 })), false);
  assert.equal(launcher.click(1), true);
  launcher.close();
  launcher.pointerDown(pointer());
  launcher.pointerCancel();
  assert.equal(launcher.click(0), true, "keyboard activation survives a cancelled touch");
  launcher.close();
  assert.equal(launcher.click(0), true);
});

test("closing before a delayed compatibility click does not reopen the panel", () => {
  const launcher = createGwapMojisLauncher();
  launcher.pointerDown(pointer());
  assert.equal(launcher.pointerUp(pointer({ timeStamp: 200 })), true);
  launcher.close();
  assert.equal(launcher.click(1), false);
  launcher.pointerDown(pointer({ pointerType: "mouse", timeStamp: 300 }));
  assert.equal(launcher.click(1), true);
});
