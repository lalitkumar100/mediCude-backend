
const { run }= require('./Schema');
// Middleware to check for the secret key
const authenticateSecretKey = (req, res, next) => {
  const secretKey = req.query.key; 

  // Get the key from the environment variables
  const expectedKey = process.env.SECRET_ROUTE_KEY;

  if (secretKey && secretKey === expectedKey) {
    // If the keys match, proceed to the next middleware/route handler
    next();
  } else {
    // If the keys don't match, send a 403 Forbidden error
    res.status(403).send('Forbidden: Invalid secret key.');
  }
};

// The function to be executed by the secret route
const executeSecretTask = async (req, res) => {
    try {
  console.log('Secret task is being executed!');
   await run();
  const result = "Secret task completed successfully.";

    res.status(200).json({ message: result });
  } catch (error) {
    console.error('Error executing secret task:', error);
    res.status(500).json({ message: 'An error occurred while executing the task.' });
}};

module.exports = {executeSecretTask ,authenticateSecretKey}