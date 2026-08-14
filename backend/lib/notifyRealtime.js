/**
 * Emit a notification only to the recipient's socket room (user id).
 * Falls back to no-op when io or userId is missing.
 */
export function emitUserNotification(io, notification) {
  if (!io || !notification) return;
  const userId = notification.userId;
  if (userId) {
    io.to(String(userId)).emit("notification.created", notification);
    return;
  }
  // Unscoped notifications are not broadcast (inbox is per-user only).
}
