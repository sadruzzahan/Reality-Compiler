export function handleForUser(
  userId: string,
  email: string | null,
  username: string | null,
  firstName: string | null,
): string {
  if (username) return username;
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  if (firstName) return firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (userId === "system-seed") return "studio";
  return `maker-${userId.slice(-6)}`;
}
