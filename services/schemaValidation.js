const Joi = require('joi');


const wholesalerSchema = Joi.object({
  name: Joi.string().max(100).required(),
  gst_no: Joi.string().length(15).alphanum().required(),
  address: Joi.string().allow('').optional(),
  contact: Joi.string().pattern(/^\d{10,15}$/).allow('').optional(),
  email: Joi.string().email().allow('').optional()
});

// Validation schema for update
const updateWholesalerSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  gst_no: Joi.string().length(15).alphanum().optional(),
  address: Joi.string().optional().allow(''),
  contact: Joi.string().pattern(/^\d{10,15}$/).optional().allow(''),
  email: Joi.string().email().optional().allow('')
}).min(1); // At least one field must be present

module.exports = {
  wholesalerSchema, 
    updateWholesalerSchema  
};
