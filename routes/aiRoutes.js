// routes/aiRoutes.js
const express = require('express');
const router = express.Router();
// To this:
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const aiController = require('../controller/aiController');


// All routes here are prefixed with /ai in server.js
router.get('/chatMenu', aiController.getChatMenu);

// GET: /ai/openChat/dddd
router.get('/openChat/:id', aiController.openChat);
// POST: /ai/pipeline/:id
// To this (assuming the frontend sends the file under the key 'image')
router.post('/pipeline/:id', upload.single('image'), aiController.getAnalyticsResponse);
// POST: /ai/process-invoice
router.post('/process-invoice', upload.single('invoice'), aiController.processInvoice);
module.exports = router;