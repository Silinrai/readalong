// Readalong: a handle on the narration controller for the browser dev tools
// (window.__readalongTTS). Development builds only.
export const exposeForDevTools = (controller: unknown) => {
  if (process.env.NODE_ENV !== 'development') return;
  (window as unknown as { __readalongTTS?: unknown }).__readalongTTS = controller;
};
