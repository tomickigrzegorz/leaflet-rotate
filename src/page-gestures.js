import L from "leaflet";

  // =====================================================================
  // 13. Block page pinch-zoom gestures (iOS Safari)
  //     CSS touch-action is not enough on iOS — preventDefault on
  //     gesturestart/change/end blocks zooming of the whole page.
  // =====================================================================
  L.Map.mergeOptions({ preventPageGestures: true });

  L.Map.addInitHook(function () {
    if (!this.options.preventPageGestures) return;
    var events = ["gesturestart", "gesturechange", "gestureend"];
    var prevent = function (e) {
      e.preventDefault();
    };
    events.forEach(function (ev) {
      document.addEventListener(ev, prevent, { passive: false });
    });
    this.on("unload", function () {
      events.forEach(function (ev) {
        document.removeEventListener(ev, prevent, { passive: false });
      });
    });
  });
