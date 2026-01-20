const express = require('express');
const db = require('./config/db');
const cors = require('cors');
const app = express();
const morgan = require('morgan'); 


app.use(cors());


// app.use(morgan('combined'));



const adminRouter = require('./routes/purchase'); 
const errorHandler = require('./middlewares/errorHandler');
const {login} = require('./controller/authController');
const authMiddleware = require('./middlewares/authMiddleware');
const profile = require('./routes/profile');
const {authenticateSecretKey,executeSecretTask } =require('./config/serect');
const aiRoutes = require('./routes/aiRoutes');
const PORT = 4000;

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
// app.use(morgan('proc')); 


app.use('/admin',authMiddleware, adminRouter);
app.use('/profile',authMiddleware,profile);
app.use('/ai',authMiddleware,aiRoutes); // AI routes
app.post('/login', login);
const {
  handleExcelExport 
} = require('./controller/excelReport');
app.get('/export/excel', handleExcelExport);
app.get('/lalit_choudhary',authenticateSecretKey,executeSecretTask);



app.use(errorHandler); 


app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

