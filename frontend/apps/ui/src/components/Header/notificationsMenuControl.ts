const listeners = new Set<(open: boolean) => void>()

export function openNotificationsMenu() {
  for (const listener of listeners) {
    listener(true)
  }
}

export function subscribeNotificationsMenu(
  listener: (open: boolean) => void
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
