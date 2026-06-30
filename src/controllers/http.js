export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw httpError(403, "You do not have access to this action.");
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
