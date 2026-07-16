// Express 4 doesn't catch rejected promises from async route handlers -
// wrap them so errors reach errorHandler instead of hanging the request.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
