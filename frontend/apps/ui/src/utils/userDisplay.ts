export function displayName(user: {
  first_name?: string | null
  last_name?: string | null
  username: string
}): string {
  const full = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  return full || user.username
}
