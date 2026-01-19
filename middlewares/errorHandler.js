const errorHandler = (err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const statusCode = err.statusCode || res.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
    statusCode,
  });
};

module.exports = errorHandler;
