type MobileBackHandler = () => boolean;

const handlers: MobileBackHandler[] = [];

/** Register a LIFO back handler (modals, nested views). Returns unregister fn. */
export function registerMobileBackHandler(handler: MobileBackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** Returns true when a registered handler consumed the back action. */
export function tryHandleMobileBack(): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index]()) return true;
  }
  return false;
}

export function clearMobileBackHandlers(): void {
  handlers.length = 0;
}
