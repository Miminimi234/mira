/// <reference types="vite/client" />

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
  var Buffer: typeof import("buffer").Buffer;
}
