= require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const apiRoutes = require('./api'); // Corrected the path
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000; // Corrected the assignment

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public'))); // Corrected the function call

app.use('/api', apiRoutes); // Added the missing prefix