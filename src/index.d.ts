import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    dragRotate?: boolean;
    rotateControl?: boolean | Control.RotateOptions;
    rotateClockwise?: boolean;
    preventPageGestures?: boolean;
  }

  interface MarkerOptions {
    rotation?: number;
    rotateWithView?: boolean;
    scale?: number;
  }

  interface Map {
    setBearing(theta: number): this;
    getBearing(): number;
    setHeading(deg: number | null, options?: { ease?: number; deadzone?: number }): this;
    stopHeadingUp(): this;
    getHeadingUp(): boolean;

    touchGestures?: Handler;
    shiftKeyRotate?: Handler;
    dragRotate?: Handler;
    rotateControl?: Control.Rotate;
  }

  namespace Control {
    interface RotateOptions extends ControlOptions {
      behavior?: "reset" | "toggle";
      closeOnZeroBearing?: boolean;
      enabled?: boolean;
    }

    class Rotate extends Control {
      constructor(options?: RotateOptions);
      options: RotateOptions;
    }
  }

  namespace control {
    function rotate(options?: Control.RotateOptions): Control.Rotate;
  }
}
