const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, updatePassword} = require('../controller/profileController');

router.get('',getProfile);
router.put('',updateProfile)
router.put('/changePassword',updatePassword);

module.exports = router;