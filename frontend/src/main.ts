import { api } from "./api";
import { start } from "./app";

start(api).then(
  (app) => {
    let last = performance.now();
    const frame = (now: number): void => {
      // Cap the step so a background tab does not jump ahead on return.
      app.advance(Math.min(100, now - last));
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
  (error) => {
    const box = document.getElementById("error")!;
    box.textContent = `Could not reach the simulation backend: ${error instanceof Error ? error.message : error}`;
    box.hidden = false;
  },
);
