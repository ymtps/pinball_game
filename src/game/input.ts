export interface KeyState {
  leftFlipper: boolean;
  rightFlipper: boolean;
  plunger: boolean;
}

export function createInputHandler(): {
  keyState: KeyState;
  attach: () => void;
  detach: () => void;
} {
  const keyState: KeyState = {
    leftFlipper: false,
    rightFlipper: false,
    plunger: false,
  };

  function onKeyDown(e: KeyboardEvent) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyZ":
        keyState.leftFlipper = true;
        e.preventDefault();
        break;
      case "ArrowRight":
      case "KeyX":
        keyState.rightFlipper = true;
        e.preventDefault();
        break;
      case "Space":
        keyState.plunger = true;
        e.preventDefault();
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyZ":
        keyState.leftFlipper = false;
        break;
      case "ArrowRight":
      case "KeyX":
        keyState.rightFlipper = false;
        break;
      case "Space":
        keyState.plunger = false;
        break;
    }
  }

  return {
    keyState,
    attach() {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    },
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
